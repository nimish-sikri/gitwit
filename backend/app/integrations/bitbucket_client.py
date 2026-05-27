"""Bitbucket REST API client — supports both Server/Data Center and Cloud."""
from __future__ import annotations

import hashlib
import hmac
import logging
from urllib.parse import urlparse

import httpx

from app import runtime
from app.config import settings

logger = logging.getLogger(__name__)


def _is_server() -> bool:
    return bool(runtime.get_key("bitbucket_server_url", settings.bitbucket_server_url))


def _server_url() -> str:
    return runtime.get_key("bitbucket_server_url", settings.bitbucket_server_url).rstrip("/")


def _credentials() -> tuple[str, str]:
    username = runtime.get_key("bitbucket_username", settings.bitbucket_username)
    password = runtime.get_key("bitbucket_app_password", settings.bitbucket_app_password)
    return username, password


# ── Signature verification ──────────────────────────────────────────────────

def verify_bitbucket_signature(payload_bytes: bytes, signature_header: str) -> bool:
    """Verify X-Hub-Signature from Bitbucket Server webhook (optional secret)."""
    secret = runtime.get_key("bitbucket_webhook_secret", settings.bitbucket_webhook_secret)
    if not secret:
        return True  # no secret configured → skip verification in dev
    expected = "sha256=" + hmac.new(
        secret.encode(), payload_bytes, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")


# ── PR diff fetching ─────────────────────────────────────────────────────────

def get_pr_diff_server(project_key: str, repo_slug: str, pr_id: int) -> dict:
    """Fetch Bitbucket Server JSON diff for a PR."""
    username, token = _credentials()
    url = f"{_server_url()}/rest/api/1.0/projects/{project_key}/repos/{repo_slug}/pull-requests/{pr_id}/diff"
    resp = httpx.get(url, auth=(username, token), timeout=30, params={"withComments": "false"})
    resp.raise_for_status()
    return resp.json()


def get_pr_diff_cloud(workspace: str, repo_slug: str, pr_id: int) -> str:
    """Fetch Bitbucket Cloud raw unified diff for a PR."""
    username, password = _credentials()
    url = f"https://api.bitbucket.org/2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/diff"
    resp = httpx.get(url, auth=(username, password), timeout=30)
    resp.raise_for_status()
    return resp.text


def get_pr_changed_files_cloud(workspace: str, repo_slug: str, pr_id: int) -> list[str]:
    """Return list of changed file paths for a Bitbucket Cloud PR."""
    username, password = _credentials()
    url = f"https://api.bitbucket.org/2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/diffstat"
    resp = httpx.get(url, auth=(username, password), timeout=30)
    resp.raise_for_status()
    data = resp.json()
    files = []
    for item in data.get("values", []):
        path = (item.get("new") or item.get("old") or {}).get("path", "")
        if path:
            files.append(path)
    return files


# ── Comment posting ──────────────────────────────────────────────────────────

def post_inline_comment_server(
    project_key: str, repo_slug: str, pr_id: int,
    path: str, line: int, body: str,
) -> None:
    """Post an inline comment on a specific line in a Bitbucket Server PR."""
    username, token = _credentials()
    url = f"{_server_url()}/rest/api/1.0/projects/{project_key}/repos/{repo_slug}/pull-requests/{pr_id}/comments"
    payload = {
        "text": body,
        "anchor": {
            "line": line,
            "lineType": "ADDED",
            "fileType": "TO",
            "path": path,
        },
    }
    resp = httpx.post(url, json=payload, auth=(username, token), timeout=15)
    if resp.status_code not in (200, 201):
        logger.error("Bitbucket inline comment failed %s: %s", resp.status_code, resp.text[:200])
        resp.raise_for_status()


def post_pr_comment_server(project_key: str, repo_slug: str, pr_id: int, body: str) -> None:
    """Post a general (non-inline) comment on a Bitbucket Server PR."""
    username, token = _credentials()
    url = f"{_server_url()}/rest/api/1.0/projects/{project_key}/repos/{repo_slug}/pull-requests/{pr_id}/comments"
    resp = httpx.post(url, json={"text": body}, auth=(username, token), timeout=15)
    if resp.status_code not in (200, 201):
        logger.error("Bitbucket PR comment failed %s: %s", resp.status_code, resp.text[:200])
        resp.raise_for_status()


def post_inline_comment_cloud(
    workspace: str, repo_slug: str, pr_id: int,
    path: str, line: int, body: str,
) -> None:
    """Post an inline comment on a Bitbucket Cloud PR."""
    username, password = _credentials()
    url = f"https://api.bitbucket.org/2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/comments"
    payload = {
        "content": {"raw": body},
        "inline": {"path": path, "to": line},
    }
    resp = httpx.post(url, json=payload, auth=(username, password), timeout=15)
    if resp.status_code not in (200, 201):
        logger.error("Bitbucket Cloud inline comment failed %s: %s", resp.status_code, resp.text[:200])
        resp.raise_for_status()


def post_pr_comment_cloud(workspace: str, repo_slug: str, pr_id: int, body: str) -> None:
    username, password = _credentials()
    url = f"https://api.bitbucket.org/2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pr_id}/comments"
    resp = httpx.post(url, json={"content": {"raw": body}}, auth=(username, password), timeout=15)
    if resp.status_code not in (200, 201):
        resp.raise_for_status()


# ── Payload parsing helpers ──────────────────────────────────────────────────

def parse_server_payload(payload: dict) -> dict:
    """Extract PR metadata from Bitbucket Server webhook payload."""
    pr = payload.get("pullRequest", {})
    from_ref = pr.get("fromRef", {})
    to_repo = from_ref.get("repository", {})
    project_key = to_repo.get("project", {}).get("key", "")
    repo_slug = to_repo.get("slug", "")
    pr_id = pr.get("id", 0)
    head_sha = from_ref.get("latestCommit", "")
    # Build clone URL
    clone_url = ""
    for link in to_repo.get("links", {}).get("clone", []):
        if link.get("name") == "http":
            clone_url = link["href"]
            break
    return {
        "project_key": project_key,
        "repo_slug": repo_slug,
        "pr_id": pr_id,
        "head_sha": head_sha,
        "clone_url": clone_url,
        "pr_title": pr.get("title", ""),
    }


def parse_cloud_payload(payload: dict) -> dict:
    """Extract PR metadata from Bitbucket Cloud webhook payload."""
    pr = payload.get("pullrequest", {})
    repo = payload.get("repository", {})
    full_name = repo.get("full_name", "")  # workspace/slug
    workspace, _, repo_slug = full_name.partition("/")
    pr_id = pr.get("id", 0)
    head_sha = pr.get("source", {}).get("commit", {}).get("hash", "")
    clone_url = ""
    for link in repo.get("links", {}).get("clone", []):
        if link.get("name") == "https":
            clone_url = link["href"]
            break
    return {
        "workspace": workspace,
        "repo_slug": repo_slug,
        "pr_id": pr_id,
        "head_sha": head_sha,
        "clone_url": clone_url,
        "pr_title": pr.get("title", ""),
    }
