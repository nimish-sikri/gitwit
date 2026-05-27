from __future__ import annotations

import re
from dataclasses import dataclass, field

_HUNK_HEADER_RE = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")

SKIP_EXTENSIONS = {
    ".md", ".txt", ".rst", ".lock", ".sum", ".toml",
    ".yaml", ".yml", ".json", ".xml", ".env", ".gitignore",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".pdf", ".zip", ".tar", ".gz",
}


@dataclass
class DiffHunk:
    filename: str
    diff_position: int        # cumulative line offset in unified diff (GitHub)
    added_lines: list[str]
    context_lines: list[str]
    new_start_line: int       # first line in new file
    new_end_line: int = 0     # last added line in new file (Bitbucket)


@dataclass
class FileDiff:
    filename: str
    hunks: list[DiffHunk] = field(default_factory=list)
    is_code_file: bool = True


def _is_code(filename: str) -> bool:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext not in SKIP_EXTENSIONS


def parse_pr_files(pr_files: list[dict]) -> list[FileDiff]:
    """Convert GitHub PR files API response into FileDiff objects."""
    result = []
    for pf in pr_files:
        filename = pf.get("filename", "")
        patch = pf.get("patch", "") or ""
        if pf.get("status") == "removed":
            continue
        is_code = _is_code(filename)
        fd = FileDiff(filename=filename, is_code_file=is_code)
        if patch and is_code:
            fd.hunks = _parse_unified_patch(filename, patch)
        result.append(fd)
    return result


def parse_bitbucket_server_diff(bb_diff: dict) -> list[FileDiff]:
    """Convert Bitbucket Server JSON diff response into FileDiff objects.

    Bitbucket Server's /diff endpoint returns structured JSON with segments
    of type CONTEXT, ADDED, REMOVED. We track the actual destination line
    numbers so inline comments can reference them directly.
    """
    result = []
    for diff_entry in bb_diff.get("diffs", []):
        dest = diff_entry.get("destination") or diff_entry.get("source") or {}
        filename = dest.get("toString", "")
        if not filename:
            continue
        is_code = _is_code(filename)
        fd = FileDiff(filename=filename, is_code_file=is_code)
        if not is_code:
            result.append(fd)
            continue

        diff_pos = 0  # synthetic diff position counter
        for hunk in diff_entry.get("hunks", []):
            dest_start: int = hunk.get("destinationLine", 1)
            added: list[str] = []
            context: list[str] = []
            last_added_line = dest_start
            current_dest_line = dest_start

            for segment in hunk.get("segments", []):
                seg_type = segment.get("type", "")
                for ln in segment.get("lines", []):
                    diff_pos += 1
                    text: str = ln.get("line", "")
                    if seg_type == "ADDED":
                        added.append(text)
                        last_added_line = current_dest_line
                        current_dest_line += 1
                    elif seg_type == "CONTEXT":
                        context.append(text)
                        current_dest_line += 1
                    # REMOVED lines don't advance destination line counter

            if added or context:
                fd.hunks.append(DiffHunk(
                    filename=filename,
                    diff_position=diff_pos,
                    added_lines=added,
                    context_lines=context,
                    new_start_line=dest_start,
                    new_end_line=last_added_line,
                ))

        result.append(fd)
    return result


def parse_bitbucket_cloud_diff(raw_diff: str, changed_files: list[str]) -> list[FileDiff]:
    """Parse Bitbucket Cloud raw unified diff text into FileDiff objects."""
    file_patches: dict[str, str] = {}
    current_file = ""
    current_lines: list[str] = []

    for line in raw_diff.splitlines():
        if line.startswith("diff --git"):
            if current_file and current_lines:
                file_patches[current_file] = "\n".join(current_lines)
            current_file = ""
            current_lines = []
        elif line.startswith("+++ b/"):
            current_file = line[6:]
        elif current_file:
            current_lines.append(line)

    if current_file and current_lines:
        file_patches[current_file] = "\n".join(current_lines)

    result = []
    for filename in changed_files:
        is_code = _is_code(filename)
        fd = FileDiff(filename=filename, is_code_file=is_code)
        patch = file_patches.get(filename, "")
        if patch and is_code:
            fd.hunks = _parse_unified_patch(filename, patch)
        result.append(fd)
    return result


def _parse_unified_patch(filename: str, patch: str) -> list[DiffHunk]:
    """Parse unified diff patch. diff_position = cumulative line offset (GitHub)."""
    hunks: list[DiffHunk] = []
    lines = patch.splitlines()
    position = 0
    current: DiffHunk | None = None
    current_dest_line = 0

    for line in lines:
        position += 1
        m = _HUNK_HEADER_RE.match(line)
        if m:
            if current and (current.added_lines or current.context_lines):
                hunks.append(current)
            new_start = int(m.group(1))
            current = DiffHunk(
                filename=filename,
                diff_position=position,
                added_lines=[],
                context_lines=[],
                new_start_line=new_start,
                new_end_line=new_start,
            )
            current_dest_line = new_start
        elif current is not None:
            if line.startswith("+"):
                current.added_lines.append(line[1:])
                current.diff_position = position
                current.new_end_line = current_dest_line
                current_dest_line += 1
            elif line.startswith(" "):
                current.context_lines.append(line[1:])
                current_dest_line += 1

    if current and (current.added_lines or current.context_lines):
        hunks.append(current)
    return hunks


def hunk_to_review_text(hunk: DiffHunk) -> str:
    lines = []
    if hunk.context_lines:
        lines.append("# Context:")
        lines.extend(hunk.context_lines[:5])
    if hunk.added_lines:
        lines.append("# New code:")
        lines.extend(hunk.added_lines)
    return "\n".join(lines)
