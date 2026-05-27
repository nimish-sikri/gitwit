from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.integrations.claude_client import review_diff
from app.services.retrieval.hybrid_search import hybrid_search, search_result_to_dict
from app.services.review.diff_parser import DiffHunk, FileDiff, hunk_to_review_text

logger = logging.getLogger(__name__)

_ISSUE_RE = re.compile(
    r"^(?P<file>[^\s:]+):(?P<line>\d+)\s*[—–-]+\s*\[(?P<severity>bug|security|suggestion|style)\]\s*[—–-]+\s*(?P<desc>.+)$",
    re.IGNORECASE,
)

SEVERITY_EMOJI = {
    "bug": "🐛",
    "security": "🔒",
    "suggestion": "💡",
    "style": "🎨",
}


@dataclass
class ReviewComment:
    filename: str
    diff_position: int   # GitHub: offset within unified diff
    severity: str
    description: str
    body: str
    new_line: int = 0    # Bitbucket: actual file line number in new version


async def review_file_diff(
    repo_id: str,
    file_diff: FileDiff,
) -> list[ReviewComment]:
    """Review a single file's diff hunks against the indexed codebase."""
    if not file_diff.is_code_file or not file_diff.hunks:
        return []

    comments: list[ReviewComment] = []
    for hunk in file_diff.hunks:
        hunk_text = hunk_to_review_text(hunk)
        if not hunk_text.strip():
            continue

        # Retrieve similar patterns from the existing codebase
        try:
            results = await hybrid_search(repo_id, hunk_text, top_k=5)
            context = [search_result_to_dict(r) for r in results]
        except Exception:
            context = []

        try:
            raw_review = await review_diff(hunk_text, context)
        except Exception as exc:
            logger.error("Claude review failed for %s: %s", file_diff.filename, exc)
            continue

        for line in raw_review.splitlines():
            line = line.strip()
            if not line or line == "NO_ISSUES":
                continue
            match = _ISSUE_RE.match(line)
            if match:
                severity = match.group("severity").lower()
                emoji = SEVERITY_EMOJI.get(severity, "")
                desc = match.group("desc").strip()
                body = f"{emoji} **[{severity.upper()}]** {desc}"
                comments.append(
                    ReviewComment(
                        filename=file_diff.filename,
                        diff_position=hunk.diff_position,
                        severity=severity,
                        description=desc,
                        body=body,
                        new_line=hunk.new_end_line or hunk.new_start_line,
                    )
                )

    return comments


async def review_pr(repo_id: str, file_diffs: list[FileDiff]) -> list[ReviewComment]:
    """Review all changed files in a PR."""
    from app.config import settings

    all_comments: list[ReviewComment] = []
    code_files = [f for f in file_diffs if f.is_code_file and f.hunks][:settings.review_max_files]

    for file_diff in code_files:
        try:
            comments = await review_file_diff(repo_id, file_diff)
            all_comments.extend(comments)
        except Exception as exc:
            logger.error("Failed to review %s: %s", file_diff.filename, exc)

    return all_comments
