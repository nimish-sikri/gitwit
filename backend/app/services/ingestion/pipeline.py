from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from app import runtime
from app.config import settings
from app.db.chroma import get_chunk_collection, get_registry_collection, delete_chunk_collection
from app.integrations.embedder import get_embedder
from app.services.ingestion.ast_chunker import Chunk, chunk_file
from app.services.ingestion.cloner import (
    clone_or_pull,
    get_changed_files,
    local_path,
    repo_id_from_url,
    walk_repo_files,
)

logger = logging.getLogger(__name__)

# Simple in-memory progress store keyed by repo_id
_progress: dict[str, dict] = {}


def get_progress(repo_id: str) -> dict:
    return _progress.get(repo_id, {"status": "unknown", "message": "", "pct": 0})


def _set_progress(repo_id: str, status: str, message: str, pct: int = 0) -> None:
    _progress[repo_id] = {"status": status, "message": message, "pct": pct}


async def ingest_repo(
    url: str,
    branch: str | None = None,
    incremental: bool = False,
    embed_provider: str | None = None,
    user_id: str = "anonymous",
) -> str:
    """Full or incremental ingestion. Returns repo_id."""
    repo_id = repo_id_from_url(url)
    _set_progress(repo_id, "cloning", "Cloning repository…", 5)

    # Write to registry immediately so GET /repos/{id} works during indexing
    _effective_provider = embed_provider or runtime.get_key("default_embed_provider", settings.embedding_provider)
    registry = get_registry_collection()
    registry.upsert(
        ids=[repo_id],
        documents=[url],
        metadatas=[{
            "repo_url": url,
            "repo_id": repo_id,
            "user_id": user_id,
            "last_commit": "",
            "total_chunks": 0,
            "status": "indexing",
            "indexed_at": datetime.now(timezone.utc).isoformat(),
            "embed_provider": _effective_provider,
            "embed_dimension": "0",
        }],
    )

    try:
        repo = await asyncio.get_event_loop().run_in_executor(
            None, clone_or_pull, url, repo_id, branch
        )
        head_sha = repo.head.commit.hexsha
        try:
            active_branch = repo.active_branch.name
        except TypeError:
            active_branch = head_sha[:7]  # detached HEAD — use short SHA

        # Check existing chunk count — if zero, always do a full index regardless of flag
        existing_chunks = get_chunk_collection(repo_id).count()

        if incremental and existing_chunks > 0:
            changed = await asyncio.get_event_loop().run_in_executor(
                None, get_changed_files, repo_id
            )
            if not changed:
                # Update registry so status shows ready, not indexing
                registry.upsert(
                    ids=[repo_id],
                    documents=[url],
                    metadatas=[{
                        "repo_url": url,
                        "repo_id": repo_id,
                        "last_commit": head_sha,
                        "branch": active_branch,
                        "total_chunks": existing_chunks,
                        "status": "ready",
                        "indexed_at": datetime.now(timezone.utc).isoformat(),
                        "embed_provider": _effective_provider,
                        "embed_dimension": str(existing_chunks),
                    }],
                )
                _set_progress(repo_id, "ready", "No changed files — index up to date.", 100)
                return repo_id
            all_files = [local_path(repo_id) / f for f in changed]
            all_files = [f for f in all_files if f.exists()]
        else:
            _set_progress(repo_id, "scanning", "Scanning files…", 10)
            all_files = await asyncio.get_event_loop().run_in_executor(
                None, walk_repo_files, repo_id
            )

        total = len(all_files)
        logger.info("Ingesting %d files for %s", total, url)
        _set_progress(repo_id, "chunking", f"Chunking {total} files…", 15)

        repo_root = local_path(repo_id)
        all_chunks: list[Chunk] = []
        for fp in all_files:
            all_chunks.extend(chunk_file(fp, repo_root, settings.max_chunk_lines))

        # Deduplicate by ID — identical files in the repo produce the same chunk IDs
        seen_ids: set[str] = set()
        unique_chunks: list[Chunk] = []
        for c in all_chunks:
            if c.id not in seen_ids:
                seen_ids.add(c.id)
                unique_chunks.append(c)
        if len(unique_chunks) < len(all_chunks):
            logger.info("Deduped %d → %d chunks", len(all_chunks), len(unique_chunks))
        all_chunks = unique_chunks

        logger.info("Generated %d chunks", len(all_chunks))
        _set_progress(repo_id, "embedding", f"Embedding {len(all_chunks)} chunks…", 40)

        embedder = get_embedder(embed_provider)
        texts = [c.text for c in all_chunks]
        embeddings = await embedder.embed_documents(texts)

        _set_progress(repo_id, "storing", "Storing in ChromaDB…", 80)
        collection = get_chunk_collection(repo_id)

        # Upsert in batches of 500 (ChromaDB limit)
        batch = 500
        for i in range(0, len(all_chunks), batch):
            b_chunks = all_chunks[i : i + batch]
            b_embeddings = embeddings[i : i + batch]
            # Safety dedup within each batch (guards against any remaining ID collisions)
            seen: set[str] = set()
            safe_chunks, safe_embeddings = [], []
            for c, e in zip(b_chunks, b_embeddings):
                if c.id not in seen:
                    seen.add(c.id)
                    safe_chunks.append(c)
                    safe_embeddings.append(e)
            b_chunks, b_embeddings = safe_chunks, safe_embeddings
            collection.upsert(
                ids=[c.id for c in b_chunks],
                embeddings=b_embeddings,
                documents=[c.text for c in b_chunks],
                metadatas=[
                    {
                        "repo_id": repo_id,
                        "repo_url": url,
                        "file_path": c.file_path,
                        "language": c.language,
                        "start_line": c.start_line,
                        "end_line": c.end_line,
                        "chunk_type": c.chunk_type,
                        "node_name": c.node_name,
                        "git_commit": head_sha,
                        "file_hash": c.file_hash,
                        "ingested_at": datetime.now(timezone.utc).isoformat(),
                        "token_count": len(c.text.split()),
                    }
                    for c in b_chunks
                ],
            )

        # Update registry
        registry = get_registry_collection()
        registry.upsert(
            ids=[repo_id],
            documents=[url],
            metadatas=[
                {
                    "repo_url": url,
                    "repo_id": repo_id,
                    "user_id": user_id,
                    "last_commit": head_sha,
                    "branch": active_branch,
                    "total_chunks": len(all_chunks),
                    "status": "ready",
                    "indexed_at": datetime.now(timezone.utc).isoformat(),
                    "embed_provider": _effective_provider,
                    "embed_dimension": str(embedder.dimension),
                }
            ],
        )

        # Pre-warm the BM25 index so the first query is instant
        from app.services.retrieval.hybrid_search import build_bm25_index
        await asyncio.get_event_loop().run_in_executor(None, build_bm25_index, repo_id)

        _set_progress(repo_id, "ready", f"Indexed {len(all_chunks)} chunks.", 100)
        logger.info("Ingestion complete for %s: %d chunks", url, len(all_chunks))
        return repo_id

    except Exception as exc:
        _set_progress(repo_id, "error", str(exc), 0)
        logger.exception("Ingestion failed for %s", url)
        raise


async def delete_repo(repo_id: str) -> None:
    """Remove ChromaDB collection and local clone."""
    import shutil
    from app.services.retrieval.hybrid_search import invalidate_bm25_index

    invalidate_bm25_index(repo_id)
    delete_chunk_collection(repo_id)
    registry = get_registry_collection()
    try:
        registry.delete(ids=[repo_id])
    except Exception:
        pass
    path = local_path(repo_id)
    if path.exists():
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, lambda: shutil.rmtree(path, ignore_errors=True)
            )
        except Exception:
            logger.warning("Could not remove repo directory %s (files may be locked)", path)


def list_repos(user_id: str = "anonymous") -> list[dict]:
    registry = get_registry_collection()
    results = registry.get(include=["metadatas", "documents"])
    repos = []
    for i, meta in enumerate(results["metadatas"] or []):
        repo_id = results["ids"][i]
        # Show repo if it belongs to this user OR has no owner (legacy repos)
        owner = meta.get("user_id", "")
        if owner and owner != user_id:
            continue
        repos.append({**meta, "repo_id": repo_id, "progress": get_progress(repo_id)})
    return repos


def get_repo(repo_id: str) -> dict | None:
    registry = get_registry_collection()
    results = registry.get(ids=[repo_id], include=["metadatas"])
    if not results["ids"]:
        return None
    meta = results["metadatas"][0]
    progress = get_progress(repo_id)
    return {**meta, "repo_id": repo_id, "progress": progress}
