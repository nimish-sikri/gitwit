import chromadb
from chromadb.config import Settings as ChromaSettings
from app.config import settings

_client: chromadb.ClientAPI | None = None


def get_chroma_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        if settings.use_remote_chroma:
            _client = chromadb.HttpClient(
                host=settings.chroma_host,
                port=settings.chroma_port,
                settings=ChromaSettings(anonymized_telemetry=False),
            )
        else:
            _client = chromadb.PersistentClient(
                path=settings.chroma_persist_dir,
                settings=ChromaSettings(anonymized_telemetry=False, allow_reset=True),
            )
    return _client


CHUNK_COLLECTION_PREFIX = "code_chunks_"
REGISTRY_COLLECTION = "repo_registry"


def get_chunk_collection(repo_id: str) -> chromadb.Collection:
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=f"{CHUNK_COLLECTION_PREFIX}{repo_id}",
        metadata={"hnsw:space": "cosine"},
    )


def get_registry_collection() -> chromadb.Collection:
    client = get_chroma_client()
    return client.get_or_create_collection(name=REGISTRY_COLLECTION)


def delete_chunk_collection(repo_id: str) -> None:
    client = get_chroma_client()
    try:
        client.delete_collection(f"{CHUNK_COLLECTION_PREFIX}{repo_id}")
    except Exception:
        pass
