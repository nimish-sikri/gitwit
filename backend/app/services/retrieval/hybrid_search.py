from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass

from rank_bm25 import BM25Okapi

from app.config import settings
from app.db.chroma import get_chunk_collection
from app.integrations.embedder import get_embedder

logger = logging.getLogger(__name__)

RRF_K = 60

# In-memory BM25 cache: repo_id → (bm25, ids, docs, metas)
# Built once after indexing, reused for every query.
_bm25_cache: dict[str, tuple[BM25Okapi, list[str], list[str], list[dict]]] = {}


def build_bm25_index(repo_id: str) -> None:
    """Fetch all chunks for a repo and build a BM25 index. Cached in memory."""
    collection = get_chunk_collection(repo_id)
    total = collection.count()
    if total == 0:
        return
    logger.info("Building BM25 index for %s (%d chunks)…", repo_id, total)
    result = collection.get(include=["documents", "metadatas"])
    ids: list[str] = result["ids"]
    docs: list[str] = result["documents"]
    metas: list[dict] = result["metadatas"]
    tokenized = [doc.lower().split() for doc in docs]
    bm25 = BM25Okapi(tokenized)
    _bm25_cache[repo_id] = (bm25, ids, docs, metas)
    logger.info("BM25 index ready for %s", repo_id)


def invalidate_bm25_index(repo_id: str) -> None:
    _bm25_cache.pop(repo_id, None)


_CODE_EXTS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java",
    ".cpp", ".c", ".rb", ".cs", ".kt", ".swift", ".php",
    ".yaml", ".yml", ".toml", ".json", ".md", ".html", ".css",
}
_FILENAME_RE = re.compile(r"\b([\w][\w.\-]*\.[a-zA-Z]{1,6})\b")


def _extract_filename(query: str) -> str | None:
    """Return the rightmost code filename mentioned in the query, or None."""
    for match in reversed(_FILENAME_RE.findall(query)):
        ext = "." + match.rsplit(".", 1)[-1].lower()
        if ext in _CODE_EXTS:
            return match.split("/")[-1].lower()
    return None


def _file_chunks_from_cache(repo_id: str, filename: str) -> list[tuple[str, str, dict]]:
    """Return all BM25-cached chunks whose file_path basename matches filename."""
    if repo_id not in _bm25_cache:
        return []
    _, all_ids, all_docs, all_metas = _bm25_cache[repo_id]
    out = []
    for cid, doc, meta in zip(all_ids, all_docs, all_metas):
        fp = meta.get("file_path", "").lower().replace("\\", "/")
        basename = fp.rsplit("/", 1)[-1]
        if basename == filename:
            out.append((cid, doc, meta))
    return out


@dataclass
class SearchResult:
    chunk_id: str
    file_path: str
    start_line: int
    end_line: int
    language: str
    chunk_type: str
    node_name: str
    text: str
    rrf_score: float
    dense_rank: int
    bm25_rank: int


async def hybrid_search(
    repo_id: str,
    query: str,
    top_k: int | None = None,
    n_candidates: int = 20,
) -> list[SearchResult]:
    if top_k is None:
        top_k = settings.search_top_k

    collection = get_chunk_collection(repo_id)
    if collection.count() == 0:
        return []

    # Ensure BM25 index is warm
    if repo_id not in _bm25_cache:
        await asyncio.get_event_loop().run_in_executor(None, build_bm25_index, repo_id)
    if repo_id not in _bm25_cache:
        return []

    bm25, all_ids, all_docs, all_metas = _bm25_cache[repo_id]
    embedder = get_embedder()

    # Dense + BM25 run concurrently
    query_emb_fut = embedder.embed_query(query)
    bm25_scores_fut = asyncio.get_event_loop().run_in_executor(
        None, bm25.get_scores, query.lower().split()
    )
    query_embedding, bm25_scores = await asyncio.gather(query_emb_fut, bm25_scores_fut)

    # Dense search
    dense_results = await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: collection.query(
            query_embeddings=[query_embedding],
            n_results=min(n_candidates, collection.count()),
            include=["documents", "metadatas"],
        ),
    )
    dense_ids: list[str] = dense_results["ids"][0] if dense_results["ids"] else []
    dense_docs: list[str] = dense_results["documents"][0] if dense_results["documents"] else []
    dense_metas: list[dict] = dense_results["metadatas"][0] if dense_results["metadatas"] else []

    # BM25 top candidates
    bm25_ranked = sorted(enumerate(bm25_scores), key=lambda x: x[1], reverse=True)[:n_candidates]
    bm25_ids = [all_ids[i] for i, _ in bm25_ranked]

    # Metadata lookup
    meta_lookup: dict[str, tuple[str, dict]] = {}
    for cid, doc, meta in zip(dense_ids, dense_docs, dense_metas):
        meta_lookup[cid] = (doc, meta)
    for i, _ in bm25_ranked:
        cid = all_ids[i]
        if cid not in meta_lookup:
            meta_lookup[cid] = (all_docs[i], all_metas[i])

    # RRF fusion
    dense_rank_map = {cid: rank + 1 for rank, cid in enumerate(dense_ids)}
    bm25_rank_map = {cid: rank + 1 for rank, cid in enumerate(bm25_ids)}
    all_candidates = list(dict.fromkeys(dense_ids + bm25_ids))

    scored = sorted(
        [(cid, 1.0 / (RRF_K + dense_rank_map.get(cid, n_candidates + 1))
                + 1.0 / (RRF_K + bm25_rank_map.get(cid, n_candidates + 1)))
         for cid in all_candidates],
        key=lambda x: x[1],
        reverse=True,
    )

    results = []
    for cid, score in scored[:top_k]:
        if cid not in meta_lookup:
            continue
        doc, meta = meta_lookup[cid]
        results.append(SearchResult(
            chunk_id=cid,
            file_path=meta.get("file_path", ""),
            start_line=int(meta.get("start_line", 0)),
            end_line=int(meta.get("end_line", 0)),
            language=meta.get("language", ""),
            chunk_type=meta.get("chunk_type", ""),
            node_name=meta.get("node_name", ""),
            text=doc,
            rrf_score=score,
            dense_rank=dense_rank_map.get(cid, -1),
            bm25_rank=bm25_rank_map.get(cid, -1),
        ))

    # Filename-aware injection: if the query mentions a specific file,
    # guarantee all chunks from that file appear at the top of results.
    filename = _extract_filename(query)
    if filename:
        file_chunks = _file_chunks_from_cache(repo_id, filename)
        existing_ids = {r.chunk_id for r in results}
        injected = []
        for cid, doc, meta in file_chunks:
            if cid not in existing_ids:
                injected.append(SearchResult(
                    chunk_id=cid,
                    file_path=meta.get("file_path", ""),
                    start_line=int(meta.get("start_line", 0)),
                    end_line=int(meta.get("end_line", 0)),
                    language=meta.get("language", ""),
                    chunk_type=meta.get("chunk_type", ""),
                    node_name=meta.get("node_name", ""),
                    text=doc,
                    rrf_score=1.0,  # filename-matched chunk gets top score
                    dense_rank=-1,
                    bm25_rank=-1,
                ))
        if injected:
            logger.debug("Injecting %d file-specific chunks for '%s'", len(injected), filename)
            # File chunks first, then hybrid results; cap to top_k + injected count
            results = injected + results

    return results


def search_result_to_dict(r: SearchResult) -> dict:
    return {
        "chunk_id": r.chunk_id,
        "file_path": r.file_path,
        "start_line": r.start_line,
        "end_line": r.end_line,
        "language": r.language,
        "chunk_type": r.chunk_type,
        "node_name": r.node_name,
        "text": r.text,
        "rrf_score": r.rrf_score if (r.rrf_score is not None and r.rrf_score != float("inf") and r.rrf_score == r.rrf_score) else 1.0,
        "dense_rank": r.dense_rank,
        "bm25_rank": r.bm25_rank,
    }
