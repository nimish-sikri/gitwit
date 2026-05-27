from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.ingestion.pipeline import get_repo
from app.services.retrieval.hybrid_search import hybrid_search, search_result_to_dict

router = APIRouter(prefix="/repos", tags=["search"])


class SearchRequest(BaseModel):
    query: str
    top_k: int = 8


@router.post("/{repo_id}/search")
async def search(repo_id: str, req: SearchRequest):
    if not get_repo(repo_id):
        raise HTTPException(status_code=404, detail="Repo not found")
    results = await hybrid_search(repo_id, req.query, top_k=req.top_k)
    return [search_result_to_dict(r) for r in results]
