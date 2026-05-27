from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.webhooks import get_review_history
from app.services.ingestion.pipeline import get_repo

router = APIRouter(prefix="/repos", tags=["reviews"])


@router.get("/{repo_id}/reviews")
def list_reviews(repo_id: str) -> list[dict]:
    if not get_repo(repo_id):
        raise HTTPException(status_code=404, detail="Repo not found")
    return get_review_history(repo_id)
