import logging
import ollama
from app.config import settings

logger = logging.getLogger(__name__)


class OllamaEmbedder:
    """nomic-embed-text via local Ollama. Free, fully offline."""

    def __init__(self) -> None:
        self._client = ollama.AsyncClient(host=settings.ollama_base_url)
        self._model = settings.ollama_embed_model

    # nomic-embed-text context is 2048 tokens. Dense code can be ~1 char/token in BERT
    # WordPiece, so 2000 chars is safely under 2048 tokens even in worst case.
    _MAX_CHARS = 2_000

    def _truncate(self, text: str) -> str:
        return text[: self._MAX_CHARS] if len(text) > self._MAX_CHARS else text

    async def _embed_batch(self, batch: list[str]) -> list[list[float]]:
        """Embed a batch. On context-length errors, halve and retry; on size-1 failure, return zero vec."""
        try:
            response = await self._client.embed(model=self._model, input=batch)
            return response["embeddings"]
        except ollama.ResponseError as exc:
            if "context length" not in str(exc).lower() or len(batch) == 1:
                # Size-1 still too big — truncate more aggressively, last resort: zero vector
                if len(batch) == 1:
                    logger.warning("Chunk too large even after truncation, using zero vector")
                    return [[0.0] * 768]
                raise
            # Split batch in half and retry each
            mid = len(batch) // 2
            left = await self._embed_batch(batch[:mid])
            right = await self._embed_batch(batch[mid:])
            return left + right

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        batch_size = settings.embedding_batch_size
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = [self._truncate(t) for t in texts[i : i + batch_size]]
            embeddings = await self._embed_batch(batch)
            all_embeddings.extend(embeddings)
        return all_embeddings

    async def embed_query(self, text: str) -> list[float]:
        response = await self._client.embed(model=self._model, input=[self._truncate(text)])
        return response["embeddings"][0]

    @property
    def dimension(self) -> int:
        return 768
