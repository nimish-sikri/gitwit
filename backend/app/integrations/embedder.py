from typing import Protocol, runtime_checkable
from app.config import settings


@runtime_checkable
class EmbedderClient(Protocol):
    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    async def embed_query(self, text: str) -> list[float]: ...

    @property
    def dimension(self) -> int: ...


def get_embedder(provider: str | None = None) -> EmbedderClient:
    provider = provider or settings.embedding_provider
    if provider == "voyage":
        from app.integrations.voyage_client import VoyageEmbedder
        return VoyageEmbedder()
    elif provider == "ollama":
        from app.integrations.ollama_client import OllamaEmbedder
        return OllamaEmbedder()
    elif provider == "openai":
        from app.integrations.openai_client import OpenAIEmbedder
        return OpenAIEmbedder()
    else:
        raise ValueError(f"Unknown EMBEDDING_PROVIDER: {provider!r}. Use voyage|ollama|openai")
