"""Celery task definitions for long-running background jobs."""
from __future__ import annotations

import asyncio
import logging

from app.workers.celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(bind=True, name="ingest_repo", max_retries=2, default_retry_delay=30)
def ingest_repo_task(
    self,
    url: str,
    branch: str | None = None,
    incremental: bool = False,
    embed_provider: str | None = None,
    user_id: str = "anonymous",
) -> str:
    """Celery task that runs the full ingestion pipeline.
    Returns repo_id on success.
    """
    try:
        from app.services.ingestion.pipeline import ingest_repo
        return asyncio.run(ingest_repo(url, branch, incremental, embed_provider, user_id))
    except Exception as exc:
        logger.exception("Celery ingest_repo_task failed for %s: %s", url, exc)
        raise self.retry(exc=exc)


@celery.task(name="reindex_repo")
def reindex_repo_task(repo_url: str, user_id: str = "anonymous") -> str:
    """Incremental re-index triggered by webhook or manual request."""
    try:
        from app.services.ingestion.pipeline import ingest_repo
        return asyncio.run(ingest_repo(repo_url, None, True, None, user_id))
    except Exception as exc:
        logger.exception("Celery reindex_repo_task failed for %s: %s", repo_url, exc)
        raise
