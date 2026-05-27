from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl

from app.services.ingestion.pipeline import (
    delete_repo,
    get_repo,
    get_progress,
    ingest_repo,
    list_repos,
    repo_id_from_url,
)

router = APIRouter(prefix="/repos", tags=["repos"])
logger = logging.getLogger(__name__)


def _dispatch_ingest(url: str, branch, incremental: bool, embed_provider, user_id: str,
                     background_tasks=None) -> None:
    """Dispatch ingestion to Celery if Redis is available, otherwise use FastAPI BackgroundTasks."""
    try:
        from app.workers.tasks import ingest_repo_task
        ingest_repo_task.delay(url, branch, incremental, embed_provider, user_id)
        logger.info("Dispatched ingest to Celery for %s", url)
    except Exception:
        # Redis not running — fall back to in-process background task
        if background_tasks:
            background_tasks.add_task(ingest_repo, url, branch, incremental, embed_provider, user_id)
            logger.info("Celery unavailable — using BackgroundTasks for %s", url)
        else:
            logger.warning("No task runner available for %s", url)


def _user_id(request: Request) -> str:
    """Get the authenticated user ID from the X-User-ID header (set by Next.js middleware).
    Falls back to 'anonymous' when running without auth (dev / direct API calls)."""
    return request.headers.get("X-User-ID", "anonymous")


class IndexRepoRequest(BaseModel):
    repo_url: str
    github_url: str | None = None  # legacy alias
    branch: str | None = None
    embed_provider: str | None = None

    @property
    def resolved_url(self) -> str:
        return self.repo_url or self.github_url or ""


class IndexRepoResponse(BaseModel):
    job_id: str
    repo_id: str
    status: str


@router.post("", response_model=IndexRepoResponse)
async def index_repo(req: IndexRepoRequest, background_tasks: BackgroundTasks, request: Request):
    url = req.repo_url or req.github_url or ""
    user_id = _user_id(request)
    repo_id = repo_id_from_url(url)
    _dispatch_ingest(url, req.branch, False, req.embed_provider, user_id, background_tasks)
    return IndexRepoResponse(job_id=repo_id, repo_id=repo_id, status="queued")


@router.get("")
async def list_all_repos(request: Request):
    user_id = _user_id(request)
    return list_repos(user_id)


@router.get("/{repo_id}")
async def get_one_repo(repo_id: str, request: Request):
    user_id = _user_id(request)
    repo = get_repo(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
    # Allow access if repo belongs to user or has no owner (legacy)
    repo_owner = repo.get("user_id", "")
    if repo_owner and repo_owner != user_id:
        raise HTTPException(status_code=403, detail="Not your repo")
    return repo


@router.delete("/{repo_id}")
async def remove_repo(repo_id: str, request: Request):
    user_id = _user_id(request)
    repo = get_repo(repo_id)
    if repo:
        repo_owner = repo.get("user_id", "")
        if repo_owner and repo_owner != user_id:
            raise HTTPException(status_code=403, detail="Not your repo")
    await delete_repo(repo_id)
    return {"deleted": repo_id}


@router.post("/claim-all")
async def claim_all_repos(request: Request):
    """Re-tag ALL repos to the current user — use when migrating ownership."""
    user_id = _user_id(request)
    if user_id == "anonymous":
        raise HTTPException(status_code=401, detail="Must be signed in")
    def _do():
        from app.db.chroma import get_registry_collection
        reg = get_registry_collection()
        results = reg.get(include=["metadatas", "documents"])
        count = 0
        for i, meta in enumerate(results["metadatas"] or []):
            if not meta:
                continue
            repo_id = results["ids"][i]
            docs = results.get("documents") or []
            url = docs[i] if i < len(docs) else meta.get("repo_url", "")
            reg.upsert(ids=[repo_id], documents=[url or ""],
                       metadatas=[{**meta, "user_id": user_id}])
            count += 1
        return count
    count = await asyncio.get_event_loop().run_in_executor(None, _do)
    logger.info("Re-claimed %d repos → %s", count, user_id)
    return {"claimed": count, "user_id": user_id}


@router.post("/claim-unowned")
async def claim_unowned_repos(request: Request):
    """Tag all repos that have no user_id with the current user's ID."""
    user_id = _user_id(request)
    if user_id == "anonymous":
        raise HTTPException(status_code=401, detail="Must be signed in to claim repos")
    def _do_claim():
        from app.db.chroma import get_registry_collection
        reg = get_registry_collection()
        results = reg.get(include=["metadatas", "documents"])
        claimed_ids = []
        for i, meta in enumerate(results["metadatas"] or []):
            if not meta or meta.get("user_id"):
                continue  # already owned or no metadata
            repo_id = results["ids"][i]
            docs = results.get("documents") or []
            url = docs[i] if i < len(docs) else meta.get("repo_url", "")
            reg.upsert(
                ids=[repo_id],
                documents=[url or ""],
                metadatas=[{**meta, "user_id": user_id}],
            )
            claimed_ids.append(repo_id)
        return claimed_ids

    claimed = await asyncio.get_event_loop().run_in_executor(None, _do_claim)
    logger.info("Claimed %d unowned repos for %s", len(claimed), user_id)
    return {"claimed": len(claimed), "user_id": user_id}


@router.post("/{repo_id}/reindex")
async def reindex_repo(repo_id: str, background_tasks: BackgroundTasks, request: Request):
    user_id = _user_id(request)
    repo = get_repo(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
    repo_owner = repo.get("user_id", "")
    if repo_owner and repo_owner != user_id:
        raise HTTPException(status_code=403, detail="Not your repo")
    _dispatch_ingest(repo["repo_url"], None, True, None, user_id, background_tasks)
    return {"status": "queued", "repo_id": repo_id}


@router.get("/{repo_id}/files")
async def get_repo_files(repo_id: str):
    """Return all unique file paths indexed for a repo."""
    from app.services.retrieval.hybrid_search import _bm25_cache
    if repo_id in _bm25_cache:
        # Fast path: pull from in-memory BM25 cache
        _, _, _, all_metas = _bm25_cache[repo_id]
        paths = sorted(set(m.get("file_path", "") for m in all_metas if m.get("file_path")))
        return {"files": paths}

    # Slow path: query ChromaDB in executor so we don't block the event loop
    def _fetch():
        from app.db.chroma import get_chunk_collection
        collection = get_chunk_collection(repo_id)
        if collection.count() == 0:
            return None
        result = collection.get(include=["metadatas"])
        return sorted(set(
            m.get("file_path", "") for m in result["metadatas"] if m.get("file_path")
        ))

    paths = await asyncio.get_event_loop().run_in_executor(None, _fetch)
    if paths is None:
        raise HTTPException(status_code=404, detail="Repo not indexed")
    return {"files": paths}


@router.get("/{repo_id}/dir-chunks")
async def get_dir_chunks(repo_id: str, path: str, limit: int = 10):
    """Return a sample of indexed chunks for all files under a directory path.
    Uses BM25 cache when available to avoid a full ChromaDB scan."""
    def _fetch():
        norm_path = path.replace("\\", "/").rstrip("/")
        # Fast path: use in-memory BM25 cache
        from app.services.retrieval.hybrid_search import _bm25_cache
        if repo_id in _bm25_cache:
            _, all_ids, all_docs, all_metas = _bm25_cache[repo_id]
            chunks = []
            for doc, meta in zip(all_docs, all_metas):
                fp = (meta.get("file_path", "") or "").replace("\\", "/")
                if fp.startswith(norm_path + "/") or fp == norm_path:
                    chunks.append({
                        "text": doc,
                        "file_path": meta.get("file_path", ""),
                        "start_line": meta.get("start_line", 0),
                        "end_line": meta.get("end_line", 0),
                        "chunk_type": meta.get("chunk_type", ""),
                        "node_name": meta.get("node_name", ""),
                        "language": meta.get("language", ""),
                    })
            chunks.sort(key=lambda c: c["start_line"])
            return chunks[:limit]

        # Slow path: scan ChromaDB (only hits for repos without BM25 cache)
        from app.db.chroma import get_chunk_collection
        collection = get_chunk_collection(repo_id)
        result = collection.get(include=["documents", "metadatas"])
        chunks = []
        for doc, meta in zip(result["documents"] or [], result["metadatas"] or []):
            fp = (meta.get("file_path", "") or "").replace("\\", "/")
            if fp.startswith(norm_path + "/") or fp == norm_path:
                chunks.append({
                    "text": doc,
                    "file_path": meta.get("file_path", ""),
                    "start_line": meta.get("start_line", 0),
                    "end_line": meta.get("end_line", 0),
                    "chunk_type": meta.get("chunk_type", ""),
                    "node_name": meta.get("node_name", ""),
                    "language": meta.get("language", ""),
                })
        chunks.sort(key=lambda c: c["start_line"])
        return chunks[:limit]

    chunks = await asyncio.get_event_loop().run_in_executor(None, _fetch)
    return {"chunks": chunks}


@router.get("/{repo_id}/file-chunks")
async def get_file_chunks(repo_id: str, path: str):
    """Return all indexed chunks for a specific file path."""
    def _fetch():
        from app.db.chroma import get_chunk_collection
        collection = get_chunk_collection(repo_id)
        return collection.get(where={"file_path": path}, include=["documents", "metadatas"])

    result = await asyncio.get_event_loop().run_in_executor(None, _fetch)
    chunks = []
    for i, doc in enumerate(result["documents"] or []):
        meta = (result["metadatas"] or [])[i] or {}
        chunks.append({
            "text": doc,
            "file_path": meta.get("file_path", path),
            "start_line": meta.get("start_line", 0),
            "end_line": meta.get("end_line", 0),
            "chunk_type": meta.get("chunk_type", ""),
            "node_name": meta.get("node_name", ""),
            "language": meta.get("language", ""),
        })
    chunks.sort(key=lambda c: c["start_line"])
    return {"chunks": chunks}


@router.post("/{repo_id}/review-pr")
async def trigger_pr_review(repo_id: str, body: dict, background_tasks: BackgroundTasks):
    """Manually trigger a PR review by pasting a PR URL.

    Supports:
    - GitHub:            https://github.com/owner/repo/pull/123
    - Bitbucket Server:  https://bitbucket.company.com/projects/KEY/repos/slug/pull-requests/123
    - Bitbucket Cloud:   https://bitbucket.org/workspace/slug/pull-requests/123
    """
    import re
    from urllib.parse import urlparse

    pr_url: str = body.get("pr_url", "").strip()
    if not pr_url:
        raise HTTPException(status_code=422, detail="pr_url is required")

    repo_info = get_repo(repo_id)
    if not repo_info or repo_info.get("status") != "ready":
        raise HTTPException(status_code=400, detail="Repository is not indexed yet")

    parsed = urlparse(pr_url)
    host = (parsed.hostname or "").lower()
    path = parsed.path.rstrip("/")

    # ── GitHub ──────────────────────────────────────────────────────────────
    gh_match = re.match(r"^/([^/]+/[^/]+)/pull/(\d+)$", path)
    if "github.com" in host and gh_match:
        from app.api.webhooks import _run_review, _review_history
        repo_full_name = gh_match.group(1)
        pr_number = int(gh_match.group(2))
        # Fetch current head SHA
        try:
            from app.integrations.github_client import get_github_client
            gh = get_github_client()
            pr = gh.get_repo(repo_full_name).get_pull(pr_number)
            head_sha = pr.head.sha
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not fetch PR from GitHub: {exc}")
        background_tasks.add_task(_run_review, repo_id, repo_full_name, pr_number, head_sha)
        return {"status": "queued", "platform": "github", "pr": pr_number}

    # ── Bitbucket Server ────────────────────────────────────────────────────
    bb_server_match = re.match(r"^/projects/([^/]+)/repos/([^/]+)/pull-requests/(\d+)", path, re.I)
    if bb_server_match:
        from app.api.webhooks import _run_bitbucket_server_review
        project_key = bb_server_match.group(1).upper()
        repo_slug   = bb_server_match.group(2).lower()
        pr_id       = int(bb_server_match.group(3))
        # Fetch head SHA from Bitbucket Server
        try:
            from app import runtime
            from app.config import settings
            import httpx
            server_url = runtime.get_key("bitbucket_server_url", settings.bitbucket_server_url).rstrip("/")
            username   = runtime.get_key("bitbucket_username", settings.bitbucket_username)
            token      = runtime.get_key("bitbucket_app_password", settings.bitbucket_app_password)
            resp = httpx.get(
                f"{server_url}/rest/api/1.0/projects/{project_key}/repos/{repo_slug}/pull-requests/{pr_id}",
                auth=(username, token), timeout=15,
            )
            resp.raise_for_status()
            head_sha = resp.json().get("fromRef", {}).get("latestCommit", "unknown")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not fetch PR from Bitbucket: {exc}")
        meta = {"project_key": project_key, "repo_slug": repo_slug, "pr_id": pr_id,
                "head_sha": head_sha, "clone_url": "", "pr_title": ""}
        background_tasks.add_task(_run_bitbucket_server_review, repo_id, meta)
        return {"status": "queued", "platform": "bitbucket_server", "pr": pr_id}

    # ── Bitbucket Cloud ─────────────────────────────────────────────────────
    bb_cloud_match = re.match(r"^/([^/]+)/([^/]+)/pull-requests/(\d+)", path, re.I)
    if "bitbucket.org" in host and bb_cloud_match:
        from app.api.webhooks import _run_bitbucket_cloud_review
        workspace = bb_cloud_match.group(1)
        repo_slug = bb_cloud_match.group(2)
        pr_id     = int(bb_cloud_match.group(3))
        try:
            from app import runtime
            from app.config import settings
            import httpx
            username = runtime.get_key("bitbucket_username", settings.bitbucket_username)
            password = runtime.get_key("bitbucket_app_password", settings.bitbucket_app_password)
            resp = httpx.get(
                f"https://api.bitbucket.org/2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}",
                auth=(username, password), timeout=15,
            )
            resp.raise_for_status()
            head_sha = resp.json().get("source", {}).get("commit", {}).get("hash", "unknown")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not fetch PR from Bitbucket Cloud: {exc}")
        meta = {"workspace": workspace, "repo_slug": repo_slug, "pr_id": pr_id,
                "head_sha": head_sha, "clone_url": "", "pr_title": ""}
        background_tasks.add_task(_run_bitbucket_cloud_review, repo_id, meta)
        return {"status": "queued", "platform": "bitbucket_cloud", "pr": pr_id}

    raise HTTPException(status_code=422, detail="Unrecognised PR URL format. Paste the full browser URL of the PR.")


@router.get("/{repo_id}/progress")
async def index_progress(repo_id: str):
    """SSE stream of indexing progress. Closes when status is ready or error."""
    async def event_stream():
        while True:
            progress = get_progress(repo_id)
            yield f"data: {json.dumps(progress)}\n\n"
            if progress["status"] in ("ready", "error", "unknown"):
                break
            await asyncio.sleep(1)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
