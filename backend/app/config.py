from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # LLM
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5-20251001"
    llm_provider: Literal["anthropic", "ollama"] = "anthropic"
    ollama_llm_model: str = "llama3.2"

    # Embeddings
    embedding_provider: Literal["voyage", "ollama", "openai"] = "voyage"
    voyage_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    ollama_embed_model: str = "nomic-embed-text"
    openai_api_key: str = ""

    # ChromaDB
    chroma_persist_dir: str = "./data/chromadb"
    chroma_host: str = ""
    chroma_port: int = 8000

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # GitHub
    github_token: str = ""
    github_webhook_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""

    # Bitbucket (Cloud or Server/Data Center)
    bitbucket_username: str = ""
    bitbucket_app_password: str = ""          # Cloud: App password / Server: HTTP access token
    bitbucket_server_url: str = ""            # e.g. https://bitbucket.company.com (leave empty for Cloud)
    bitbucket_webhook_secret: str = ""        # Optional HMAC secret set in Bitbucket webhook settings

    # Storage
    repos_dir: str = "./data/repos"

    # App
    log_level: str = "INFO"
    env: str = "development"
    allowed_origins: str = "http://localhost:3000"
    max_repo_size_mb: int = 500
    embedding_batch_size: int = 64
    search_top_k: int = 20
    search_alpha: float = 0.5
    max_chunk_lines: int = 150
    review_max_files: int = 20

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def use_remote_chroma(self) -> bool:
        return bool(self.chroma_host)


settings = Settings()
