"""Post review comments to Bitbucket Server or Cloud PRs."""
from __future__ import annotations

import logging

from app.integrations.bitbucket_client import (
    post_inline_comment_cloud,
    post_inline_comment_server,
    post_pr_comment_cloud,
    post_pr_comment_server,
)
from app.services.review.reviewer import ReviewComment

logger = logging.getLogger(__name__)

_NO_ISSUES = "✅ **GitWit Code Review**: No issues found in this PR."


def post_bitbucket_server_review(
    project_key: str,
    repo_slug: str,
    pr_id: int,
    comments: list[ReviewComment],
) -> None:
    if not comments:
        post_pr_comment_server(project_key, repo_slug, pr_id, _NO_ISSUES)
        return

    posted = 0
    failed = 0
    for c in comments:
        try:
            if c.new_line and c.new_line > 0:
                post_inline_comment_server(
                    project_key, repo_slug, pr_id,
                    path=c.filename, line=c.new_line, body=c.body,
                )
            else:
                post_pr_comment_server(project_key, repo_slug, pr_id,
                    f"**{c.filename}** — {c.body}")
            posted += 1
        except Exception as exc:
            logger.error("Failed to post comment on %s L%s: %s", c.filename, c.new_line, exc)
            failed += 1

    if failed > 0 and posted == 0:
        # All inline comments failed — fall back to a single summary
        lines = [f"## GitWit Code Review — {len(comments)} issue(s)\n"]
        for c in comments:
            lines.append(f"- **{c.filename}:{c.new_line}** — {c.body}")
        post_pr_comment_server(project_key, repo_slug, pr_id, "\n".join(lines))

    logger.info("Bitbucket Server review: %d posted, %d failed", posted, failed)


def post_bitbucket_cloud_review(
    workspace: str,
    repo_slug: str,
    pr_id: int,
    comments: list[ReviewComment],
) -> None:
    if not comments:
        post_pr_comment_cloud(workspace, repo_slug, pr_id, _NO_ISSUES)
        return

    posted = 0
    failed = 0
    for c in comments:
        try:
            if c.new_line and c.new_line > 0:
                post_inline_comment_cloud(
                    workspace, repo_slug, pr_id,
                    path=c.filename, line=c.new_line, body=c.body,
                )
            else:
                post_pr_comment_cloud(workspace, repo_slug, pr_id,
                    f"**{c.filename}** — {c.body}")
            posted += 1
        except Exception as exc:
            logger.error("Failed to post Cloud comment on %s L%s: %s", c.filename, c.new_line, exc)
            failed += 1

    if failed > 0 and posted == 0:
        lines = [f"## GitWit Code Review — {len(comments)} issue(s)\n"]
        for c in comments:
            lines.append(f"- **{c.filename}:{c.new_line}** — {c.body}")
        post_pr_comment_cloud(workspace, repo_slug, pr_id, "\n".join(lines))

    logger.info("Bitbucket Cloud review: %d posted, %d failed", posted, failed)
