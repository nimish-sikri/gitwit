import hashlib
import hmac
from github import Github, GithubException
from app.config import settings

_github: Github | None = None


def get_github_client() -> Github:
    global _github
    if _github is None:
        _github = Github(settings.github_token)
    return _github


def verify_github_signature(payload_bytes: bytes, signature_header: str) -> bool:
    if not settings.github_webhook_secret:
        return True  # skip validation in dev if secret not set
    expected = "sha256=" + hmac.new(
        settings.github_webhook_secret.encode(),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")


def get_pr_files(repo_full_name: str, pr_number: int) -> list[dict]:
    """Returns list of {filename, patch, status, additions, deletions}."""
    gh = get_github_client()
    repo = gh.get_repo(repo_full_name)
    pr = repo.get_pull(pr_number)
    files = []
    for f in pr.get_files():
        files.append(
            {
                "filename": f.filename,
                "patch": f.patch or "",
                "status": f.status,
                "additions": f.additions,
                "deletions": f.deletions,
            }
        )
    return files


def create_pr_review(
    repo_full_name: str,
    pr_number: int,
    commit_sha: str,
    comments: list[dict],
) -> None:
    """Posts a PR review with inline comments.

    Each comment: {path, position, body}
    position = line offset within the unified diff (not file line number).
    """
    gh = get_github_client()
    repo = gh.get_repo(repo_full_name)
    pr = repo.get_pull(pr_number)
    try:
        pr.create_review(
            commit=repo.get_commit(commit_sha),
            event="COMMENT",
            comments=comments,
        )
    except GithubException as e:
        # Log but don't crash — partial reviews are better than no review
        import logging
        logging.getLogger(__name__).error("Failed to post PR review: %s", e)
        raise


def post_pr_comment(repo_full_name: str, pr_number: int, body: str) -> None:
    """Posts a plain issue comment on the PR (no line position needed)."""
    gh = get_github_client()
    repo = gh.get_repo(repo_full_name)
    pr = repo.get_pull(pr_number)
    pr.create_issue_comment(body)
