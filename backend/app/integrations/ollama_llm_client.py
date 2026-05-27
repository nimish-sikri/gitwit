from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

import httpx

from app import runtime
from app.config import settings
from app.integrations.claude_client import CHAT_SYSTEM, _format_context

logger = logging.getLogger(__name__)


async def stream_chat(
    user_message: str,
    history: list[dict],
    context_chunks: list[dict],
    model: str | None = None,
) -> AsyncIterator[str]:
    context_text = _format_context(context_chunks)
    system_prompt = f"{CHAT_SYSTEM}\n\nCODEBASE CONTEXT (retrieved):\n{context_text}"

    messages = [{"role": "system", "content": system_prompt}]
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_message})

    resolved_model = model or runtime.get_key("ollama_llm_model", settings.ollama_llm_model)
    base_url = settings.ollama_base_url

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{base_url}/api/chat",
            json={"model": resolved_model, "messages": messages, "stream": True},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue
