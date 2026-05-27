from __future__ import annotations

import logging

from app.integrations.github_client import create_pr_review, post_pr_comment
from app.services.review.reviewer import ReviewComment

logger = logging.getLogger(__name__)


def post_review(
    repo_full_name: str,
    pr_number: int,
    commit_sha: str,
    comments: list[ReviewComment],
) -> None:
    """Post review comments on a PR. Falls back to a single issue comment if inline fails."""
    if not comments:
        post_pr_comment(
            repo_full_name, pr_number,
            "✅ **AI Code Review**: No issues found in this PR."
        )
        return

    github_comments = [
        {"path": c.filename, "position": c.diff_position, "body": c.body}
        for c in comments
    ]
    try:
        create_pr_review(repo_full_name, pr_number, commit_sha, github_comments)
        logger.info("Posted %d review comments on %s#%s", len(comments), repo_full_name, pr_number)
    except Exception as exc:
        logger.error("Inline review failed, falling back to issue comment: %s", exc)
        # Fallback: post a summary comment
        lines = [f"## AI Code Review — {len(comments)} issue(s) found\n"]
        for c in comments:
            lines.append(f"- **{c.filename}** — {c.body}")
        post_pr_comment(repo_full_name, pr_number, "\n".join(lines))
