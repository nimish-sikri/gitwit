from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.chat.assistant import chat
from app.services.ingestion.pipeline import get_repo

router = APIRouter(prefix="/repos", tags=["chat"])
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []
    model: str | None = None


@router.post("/{repo_id}/chat")
async def stream_chat(repo_id: str, req: ChatRequest):
    if not get_repo(repo_id):
        raise HTTPException(status_code=404, detail="Repo not found or not indexed yet")

    return StreamingResponse(
        chat(repo_id, req.message, req.history, req.model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
