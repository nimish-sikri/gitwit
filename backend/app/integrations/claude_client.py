import asyncio
import logging
from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic, RateLimitError
from app.config import settings
from app import runtime

logger = logging.getLogger(__name__)

_client: AsyncAnthropic | None = None


def get_claude_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        api_key = runtime.get_key("anthropic_api_key", settings.anthropic_api_key)
        _client = AsyncAnthropic(api_key=api_key)
    return _client


CHAT_SYSTEM = """You are a senior software engineer with deep knowledge of this codebase.
When answering questions, always cite the specific file and line numbers from the retrieved context.
Format citations as `file.py:L42-L67`. Be concise and technical."""


async def stream_chat(
    user_message: str,
    history: list[dict],
    context_chunks: list[dict],
    model: str | None = None,
) -> AsyncIterator[str]:
    """Streams response text. Yields raw text deltas."""
    client = get_claude_client()
    context_text = _format_context(context_chunks)
    system_with_context = (
        f"{CHAT_SYSTEM}\n\n"
        f"CODEBASE CONTEXT (retrieved):\n{context_text}"
    )
    messages = list(history) + [{"role": "user", "content": user_message}]

    for attempt in range(3):
        try:
            async with client.messages.stream(
                model=model or settings.anthropic_model,
                max_tokens=2048,
                system=[
                    {
                        "type": "text",
                        "text": system_with_context,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield text
            return
        except RateLimitError as e:
            wait = 2 ** attempt * 5
            logger.warning("Rate limit hit (attempt %d/3), retrying in %ds: %s", attempt + 1, wait, e)
            if attempt == 2:
                raise
            await asyncio.sleep(wait)


REVIEW_SYSTEM = """You are a code reviewer with full context of this codebase.
For each issue found, output EXACTLY this format (one per line):
{filename}:{line_number} — [{severity}] — {description}
Severity must be one of: bug, security, suggestion, style
If no issues found, output: NO_ISSUES"""


async def review_diff(diff: str, context_chunks: list[dict]) -> str:
    """Returns full review text synchronously (non-streaming)."""
    client = get_claude_client()
    context_text = _format_context(context_chunks)
    prompt = (
        f"EXISTING CODEBASE PATTERNS (retrieved):\n{context_text}\n\n"
        f"NEW CODE CHANGES (PR diff):\n{diff}\n\n"
        "Review the new code. Focus on:\n"
        "1. Inconsistencies with existing patterns in this codebase\n"
        "2. Bugs or security issues\n"
        "3. Performance problems\n"
        "4. Missing error handling\n\n"
        "For each issue, cite the specific line and reference the existing code it's inconsistent with."
    )
    response = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=4096,
        system=[
            {
                "type": "text",
                "text": REVIEW_SYSTEM,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


def _format_context(chunks: list[dict]) -> str:
    parts = []
    for c in chunks:
        lang = c.get("language", "")
        path = c.get("file_path", "")
        start = c.get("start_line", "")
        end = c.get("end_line", "")
        text = c.get("text", "")
        parts.append(f"# {path}:L{start}-L{end}\n```{lang}\n{text}\n```")
    return "\n\n".join(parts)
