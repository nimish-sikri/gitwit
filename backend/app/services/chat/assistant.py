from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncIterator

from app import runtime
from app.config import settings
from app.services.retrieval.hybrid_search import hybrid_search, search_result_to_dict

logger = logging.getLogger(__name__)

# Matches `file.py:L42-L67` or `file.py:42` style citations in Claude output
_CITATION_RE = re.compile(r"`([^`]+\.[a-zA-Z]+):L?(\d+)(?:-L?(\d+))?`")


async def chat(
    repo_id: str,
    message: str,
    history: list[dict],
    model: str | None = None,
) -> AsyncIterator[str]:
    """Yields SSE-formatted event strings.

    Event types:
      event: text   data: {"delta": "..."}
      event: citation  data: {"file": "...", "start_line": N, "end_line": N, "preview": "..."}
      event: done   data: {}
    """
    yield _sse("status", {"message": "Searching codebase…"})
    try:
        results = await hybrid_search(repo_id, message)
        context = [search_result_to_dict(r) for r in results]
    except Exception as exc:
        logger.exception("hybrid_search failed for %s", repo_id)
        yield _sse("error", {"message": f"Search failed: {exc}"})
        yield _sse("done", {})
        return
    yield _sse("status", {"message": f"Searching {len(results)} chunks…"})

    # Emit retrieved context so the UI can show the context panel with scores
    yield _sse("context", {
        "chunks": [
            {
                "file_path": r.file_path,
                "start_line": r.start_line,
                "end_line": r.end_line,
                "language": r.language,
                "rrf_score": round(r.rrf_score, 3),
                "dense_rank": r.dense_rank,
                "bm25_rank": r.bm25_rank,
                "preview": r.text[:200],
            }
            for r in results
        ]
    })

    # Precompute citation lookup: file_path → list of chunks for preview
    preview_map: dict[str, list[dict]] = {}
    for chunk in context:
        preview_map.setdefault(chunk["file_path"], []).append(chunk)

    emitted_citations: set[str] = set()
    buffer = ""

    try:
        resolved_model = model or runtime.get_key("default_model", settings.anthropic_model)
        llm_provider = runtime.get_key("llm_provider", settings.llm_provider)
        if llm_provider == "ollama":
            from app.integrations.ollama_llm_client import stream_chat as stream_ollama
            _stream = stream_ollama(message, history, context, resolved_model)
        else:
            from app.integrations.claude_client import stream_chat
            _stream = stream_chat(message, history, context, resolved_model)
        async for delta in _stream:
            buffer += delta
            safe_end = len(buffer)
            last_open = buffer.rfind("`")
            if last_open != -1 and not buffer[last_open:].count("`") >= 2:
                safe_end = last_open

            text_to_emit = buffer[:safe_end]
            buffer = buffer[safe_end:]

            if text_to_emit:
                yield _sse("text", {"delta": text_to_emit})

            for match in _CITATION_RE.finditer(text_to_emit + buffer):
                citation_key = match.group(0)
                if citation_key in emitted_citations:
                    continue
                emitted_citations.add(citation_key)
                file_path = match.group(1)
                start_line = int(match.group(2))
                end_line = int(match.group(3) or match.group(2))
                preview = _get_preview(preview_map, file_path, start_line, end_line, repo_id)
                yield _sse("citation", {
                    "file": file_path,
                    "start_line": start_line,
                    "end_line": end_line,
                    "preview": preview,
                })
    except Exception as exc:
        logger.exception("LLM stream failed for %s", repo_id)
        yield _sse("error", {"message": str(exc)})

    if buffer:
        yield _sse("text", {"delta": buffer})

    yield _sse("done", {})


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _get_preview(preview_map: dict, file_path: str, start_line: int, end_line: int,
                 repo_id: str = "") -> str:
    # First try retrieved chunks
    chunks = preview_map.get(file_path, [])
    for chunk in chunks:
        if chunk["start_line"] <= start_line <= chunk["end_line"]:
            lines = chunk["text"].splitlines()
            offset = start_line - chunk["start_line"]
            snippet_lines = lines[offset : offset + (end_line - start_line + 1)]
            return "\n".join(snippet_lines[:15])

    # Fall back to reading from the cloned repo on disk
    if repo_id:
        from pathlib import Path
        from app.services.ingestion.cloner import local_path
        disk_file = local_path(repo_id) / file_path.replace("/", Path.cwd().root and "\\")
        # Try both separators
        for candidate in [local_path(repo_id) / file_path,
                          local_path(repo_id) / file_path.replace("/", "\\")]:
            try:
                all_lines = candidate.read_text(encoding="utf-8", errors="replace").splitlines()
                snippet = all_lines[max(0, start_line - 1) : end_line]
                return "\n".join(snippet[:15])
            except OSError:
                continue
    return ""
