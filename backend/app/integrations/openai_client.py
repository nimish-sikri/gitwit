from openai import AsyncOpenAI
from app.config import settings
from app import runtime


class OpenAIEmbedder:
    """text-embedding-3-small via OpenAI. $5 free credits on signup."""

    MODEL = "text-embedding-3-small"

    def __init__(self) -> None:
        api_key = runtime.get_key("openai_api_key", settings.openai_api_key)
        self._client = AsyncOpenAI(api_key=api_key)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        batch_size = settings.embedding_batch_size
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            response = await self._client.embeddings.create(input=batch, model=self.MODEL)
            all_embeddings.extend([e.embedding for e in response.data])
        return all_embeddings

    async def embed_query(self, text: str) -> list[float]:
        response = await self._client.embeddings.create(input=[text], model=self.MODEL)
        return response.data[0].embedding

    @property
    def dimension(self) -> int:
        return 1536
