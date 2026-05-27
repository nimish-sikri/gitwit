from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response

from app.integrations.github_client import (
    get_pr_files,
    post_pr_comment,
    verify_github_signature,
)
from app.integrations.bitbucket_client import (
    verify_bitbucket_signature,
    get_pr_diff_server,
    get_pr_diff_cloud,
    get_pr_changed_files_cloud,
    parse_server_payload,
    parse_cloud_payload,
)
from app.services.ingestion.pipeline import get_repo
from app.services.ingestion.cloner import repo_id_from_url
from app.services.review.diff_parser import parse_pr_files, parse_bitbucket_server_diff, parse_bitbucket_cloud_diff
from app.services.review.github_poster import post_review
from app.services.review.bitbucket_poster import post_bitbucket_server_review, post_bitbucket_cloud_review
from app.services.review.reviewer import review_pr

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)

# In-memory idempotency set: (repo_full_name, pr_number, head_sha)
_processed: set[tuple[str, int, str]] = set()

# Review history keyed by repo_id
_review_history: dict[str, list[dict]] = {}

PR_ACTIONS = {"opened", "synchronize", "reopened"}


def get_review_history(repo_id: str) -> list[dict]:
    return list(reversed(_review_history.get(repo_id, [])))


@router.post("/github")
async def handle_github(request: Request, background_tasks: BackgroundTasks):
    payload_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    if not verify_github_signature(payload_bytes, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event = request.headers.get("X-GitHub-Event", "")
    if event == "ping":
        return Response(content="pong", status_code=200)

    if event != "pull_request":
        return Response(status_code=200)

    payload = await request.json()
    action = payload.get("action", "")
    if action not in PR_ACTIONS:
        return Response(status_code=200)

    repo_url = payload["repository"]["html_url"]
    repo_full_name: str = payload["repository"]["full_name"]
    pr_number: int = payload["pull_request"]["number"]
    head_sha: str = payload["pull_request"]["head"]["sha"]

    key = (repo_full_name, pr_number, head_sha)
    if key in _processed:
        logger.info("Skipping already-processed PR %s#%s@%s", repo_full_name, pr_number, head_sha)
        return Response(status_code=200)
    _processed.add(key)

    repo_id = repo_id_from_url(repo_url)
    repo_info = get_repo(repo_id)
    if not repo_info or repo_info.get("status") != "ready":
        post_pr_comment(
            repo_full_name, pr_number,
            "⚠️ **AI Code Reviewer**: This repo is not indexed yet. "
            "Visit the dashboard to index it first.",
        )
        return Response(status_code=200)

    background_tasks.add_task(
        _run_review, repo_id, repo_full_name, pr_number, head_sha
    )
    return Response(status_code=202)


async def _run_review(
    repo_id: str,
    repo_full_name: str,
    pr_number: int,
    head_sha: str,
) -> None:
    pr_url = f"https://github.com/{repo_full_name}/pull/{pr_number}"
    entry: dict = {
        "repo_full_name": repo_full_name,
        "pr_number": pr_number,
        "pr_url": pr_url,
        "head_sha": head_sha[:7],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "status": "running",
        "comment_count": 0,
        "comments": [],
    }
    _review_history.setdefault(repo_id, []).append(entry)

    try:
        logger.info("Starting review for %s#%s", repo_full_name, pr_number)
        pr_files = get_pr_files(repo_full_name, pr_number)
        file_diffs = parse_pr_files(pr_files)
        comments = await review_pr(repo_id, file_diffs)
        post_review(repo_full_name, pr_number, head_sha, comments)

        entry["status"] = "completed"
        entry["comment_count"] = len(comments)
        entry["comments"] = [
            {"filename": c.filename, "severity": c.severity, "description": c.description}
            for c in comments
        ]
        logger.info("Review complete for %s#%s: %d comments", repo_full_name, pr_number, len(comments))
    except Exception as exc:
        entry["status"] = "error"
        entry["error"] = str(exc)
        logger.exception("Review failed for %s#%s: %s", repo_full_name, pr_number, exc)
        try:
            post_pr_comment(
                repo_full_name, pr_number,
                f"❌ **GitWit Code Review**: Review failed — {exc}"
            )
        except Exception:
            pass


# ── Bitbucket webhook ────────────────────────────────────────────────────────

BB_SERVER_EVENTS = {"pr:opened", "pr:modified", "pr:from_ref_updated"}
BB_CLOUD_EVENTS  = {"pullrequest:created", "pullrequest:updated", "pullrequest:fulfilled"}


@router.post("/bitbucket")
async def handle_bitbucket(request: Request, background_tasks: BackgroundTasks):
    payload_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature", "")

    if not verify_bitbucket_signature(payload_bytes, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event_key = request.headers.get("X-Event-Key", "")
    if not event_key:
        return Response(status_code=200)

    payload = await request.json()
    is_server = event_key in BB_SERVER_EVENTS
    is_cloud  = event_key in BB_CLOUD_EVENTS

    if not is_server and not is_cloud:
        return Response(status_code=200)

    if is_server:
        meta = parse_server_payload(payload)
        key = (meta["project_key"], meta["repo_slug"], meta["pr_id"], meta["head_sha"])
    else:
        meta = parse_cloud_payload(payload)
        key = (meta["workspace"], meta["repo_slug"], meta["pr_id"], meta["head_sha"])

    if key in _processed:
        return Response(status_code=200)
    _processed.add(key)

    clone_url = meta.get("clone_url", "")
    repo_id = repo_id_from_url(clone_url) if clone_url else ""
    repo_info = get_repo(repo_id) if repo_id else None

    if not repo_info or repo_info.get("status") != "ready":
        msg = (
            "⚠️ **GitWit Code Review**: This repo is not indexed yet. "
            "Open GitWit and index the repository first."
        )
        try:
            if is_server:
                from app.integrations.bitbucket_client import post_pr_comment_server
                post_pr_comment_server(meta["project_key"], meta["repo_slug"], meta["pr_id"], msg)
            else:
                from app.integrations.bitbucket_client import post_pr_comment_cloud
                post_pr_comment_cloud(meta["workspace"], meta["repo_slug"], meta["pr_id"], msg)
        except Exception:
            pass
        return Response(status_code=200)

    if is_server:
        background_tasks.add_task(_run_bitbucket_server_review, repo_id, meta)
    else:
        background_tasks.add_task(_run_bitbucket_cloud_review, repo_id, meta)

    return Response(status_code=202)


async def _run_bitbucket_server_review(repo_id: str, meta: dict) -> None:
    project_key = meta["project_key"]
    repo_slug   = meta["repo_slug"]
    pr_id       = meta["pr_id"]

    from app import runtime
    from app.config import settings
    server_url = runtime.get_key("bitbucket_server_url", settings.bitbucket_server_url).rstrip("/")
    bb_pr_url = f"{server_url}/projects/{project_key}/repos/{repo_slug}/pull-requests/{pr_id}" if server_url else ""
    entry: dict = {
        "repo_full_name": f"{project_key}/{repo_slug}",
        "pr_number": pr_id,
        "pr_url": bb_pr_url,
        "head_sha": meta["head_sha"][:7],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "status": "running", "comment_count": 0, "comments": [],
    }
    _review_history.setdefault(repo_id, []).append(entry)

    try:
        logger.info("Starting Bitbucket Server review for %s/%s#%s", project_key, repo_slug, pr_id)
        bb_diff  = get_pr_diff_server(project_key, repo_slug, pr_id)
        file_diffs = parse_bitbucket_server_diff(bb_diff)
        comments = await review_pr(repo_id, file_diffs)
        post_bitbucket_server_review(project_key, repo_slug, pr_id, comments)

        entry["status"] = "completed"
        entry["comment_count"] = len(comments)
        entry["comments"] = [
            {"filename": c.filename, "severity": c.severity, "description": c.description}
            for c in comments
        ]
        logger.info("Bitbucket Server review done: %d comments", len(comments))
    except Exception as exc:
        entry["status"] = "error"
        entry["error"] = str(exc)
        logger.exception("Bitbucket Server review failed: %s", exc)
        try:
            from app.integrations.bitbucket_client import post_pr_comment_server
            post_pr_comment_server(project_key, repo_slug, pr_id,
                f"❌ **GitWit Code Review**: Review failed — {exc}")
        except Exception:
            pass


async def _run_bitbucket_cloud_review(repo_id: str, meta: dict) -> None:
    workspace = meta["workspace"]
    repo_slug = meta["repo_slug"]
    pr_id     = meta["pr_id"]

    cloud_pr_url = f"https://bitbucket.org/{workspace}/{repo_slug}/pull-requests/{pr_id}"
    entry: dict = {
        "repo_full_name": f"{workspace}/{repo_slug}",
        "pr_number": pr_id,
        "pr_url": cloud_pr_url,
        "head_sha": meta["head_sha"][:7],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "status": "running", "comment_count": 0, "comments": [],
    }
    _review_history.setdefault(repo_id, []).append(entry)

    try:
        logger.info("Starting Bitbucket Cloud review for %s/%s#%s", workspace, repo_slug, pr_id)
        raw_diff     = get_pr_diff_cloud(workspace, repo_slug, pr_id)
        changed      = get_pr_changed_files_cloud(workspace, repo_slug, pr_id)
        file_diffs   = parse_bitbucket_cloud_diff(raw_diff, changed)
        comments     = await review_pr(repo_id, file_diffs)
        post_bitbucket_cloud_review(workspace, repo_slug, pr_id, comments)

        entry["status"] = "completed"
        entry["comment_count"] = len(comments)
        entry["comments"] = [
            {"filename": c.filename, "severity": c.severity, "description": c.description}
            for c in comments
        ]
        logger.info("Bitbucket Cloud review done: %d comments", len(comments))
    except Exception as exc:
        entry["status"] = "error"
        entry["error"] = str(exc)
        logger.exception("Bitbucket Cloud review failed: %s", exc)
        try:
            from app.integrations.bitbucket_client import post_pr_comment_cloud
            post_pr_comment_cloud(workspace, repo_slug, pr_id,
                f"❌ **GitWit Code Review**: Review failed — {exc}")
        except Exception:
            pass
