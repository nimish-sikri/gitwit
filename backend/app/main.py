import logging
import os
from contextlib import asynccontextmanager

os.environ["ANONYMIZED_TELEMETRY"] = "False"  # suppress ChromaDB PostHog spam

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, health, repos, reviews, search, webhooks
from app.api import settings as settings_api
from app.config import settings

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.chroma import get_chroma_client, get_registry_collection
    get_chroma_client()

    # Reset any repos left in "indexing" state from a previous crashed/restarted run.
    # Their background tasks are dead; mark them as error so the user can retry.
    try:
        registry = get_registry_collection()
        results = registry.get(include=["metadatas", "documents"])
        for i, meta in enumerate(results["metadatas"] or []):
            if meta.get("status") == "indexing":
                repo_id = results["ids"][i]
                url = results["documents"][i] if results["documents"] else meta.get("repo_url", "")
                registry.upsert(
                    ids=[repo_id],
                    documents=[url],
                    metadatas=[{**meta, "status": "error"}],
                )
                from app.services.ingestion.pipeline import _set_progress
                _set_progress(repo_id, "error", "Interrupted by server restart — click Retry to reindex", 0)
                logging.getLogger(__name__).warning("Reset stuck indexing repo %s to error", repo_id)
    except Exception:
        pass  # never block startup

    # Pre-warm BM25 index for all ready repos in the background.
    # This makes the /files endpoint fast immediately after startup.
    try:
        import asyncio
        from app.services.retrieval.hybrid_search import build_bm25_index

        ready_ids = [
            results["ids"][i]
            for i, meta in enumerate(results["metadatas"] or [])
            if meta.get("status") == "ready"
        ]

        async def _warm():
            for repo_id in ready_ids:
                try:
                    await asyncio.get_event_loop().run_in_executor(None, build_bm25_index, repo_id)
                    logging.getLogger(__name__).info("BM25 pre-warmed for %s", repo_id)
                except Exception as exc:
                    logging.getLogger(__name__).warning("BM25 pre-warm failed for %s: %s", repo_id, exc)

        asyncio.create_task(_warm())
    except Exception:
        pass  # never block startup

    yield


app = FastAPI(
    title="GitWit API",
    description="Chat with your code",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(repos.router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(search.router, prefix=API_PREFIX)
app.include_router(reviews.router, prefix=API_PREFIX)
app.include_router(webhooks.router, prefix=API_PREFIX)
app.include_router(settings_api.router, prefix=API_PREFIX)
app.include_router(health.router)
