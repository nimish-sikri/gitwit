import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential
import voyageai
from app.config import settings
from app import runtime


class VoyageEmbedder:
    """voyage-code-2 embedder. Asymmetric: use input_type='document' for indexing,
    'query' for search queries. Wrong type degrades retrieval by ~15-30%."""

    MODEL = "voyage-code-2"

    def __init__(self) -> None:
        api_key = runtime.get_key("voyage_api_key", settings.voyage_api_key)
        self._client = voyageai.Client(api_key=api_key)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def _embed_sync(self, texts: list[str], input_type: str) -> list[list[float]]:
        result = self._client.embed(texts, model=self.MODEL, input_type=input_type)
        return result.embeddings

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        batch_size = settings.embedding_batch_size
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            embeddings = await asyncio.get_event_loop().run_in_executor(
                None, self._embed_sync, batch, "document"
            )
            all_embeddings.extend(embeddings)
        return all_embeddings

    async def embed_query(self, text: str) -> list[float]:
        embeddings = await asyncio.get_event_loop().run_in_executor(
            None, self._embed_sync, [text], "query"
        )
        return embeddings[0]

    @property
    def dimension(self) -> int:
        return 1024
