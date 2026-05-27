from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app import runtime
from app.config import settings

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsStatus(BaseModel):
    anthropic_configured: bool
    voyage_configured: bool
    openai_configured: bool
    ollama_configured: bool
    default_model: str
    default_embed_provider: str
    llm_provider: str
    ollama_llm_model: str
    github_configured: bool
    bitbucket_configured: bool
    bitbucket_server_url: str


class SettingsUpdate(BaseModel):
    anthropic_api_key: str | None = None
    voyage_api_key: str | None = None
    openai_api_key: str | None = None
    default_model: str | None = None
    default_embed_provider: str | None = None
    llm_provider: str | None = None
    ollama_llm_model: str | None = None
    github_token: str | None = None
    bitbucket_username: str | None = None
    bitbucket_app_password: str | None = None
    bitbucket_server_url: str | None = None


@router.get("", response_model=SettingsStatus)
def get_settings() -> SettingsStatus:
    return SettingsStatus(
        anthropic_configured=runtime.is_configured("anthropic_api_key", settings.anthropic_api_key),
        voyage_configured=runtime.is_configured("voyage_api_key", settings.voyage_api_key),
        openai_configured=runtime.is_configured("openai_api_key", settings.openai_api_key),
        ollama_configured=True,
        default_model=runtime.get_key("default_model", settings.anthropic_model),
        default_embed_provider=runtime.get_key("default_embed_provider", settings.embedding_provider),
        llm_provider=runtime.get_key("llm_provider", settings.llm_provider),
        ollama_llm_model=runtime.get_key("ollama_llm_model", settings.ollama_llm_model),
        github_configured=runtime.is_configured("github_token", settings.github_token),
        bitbucket_configured=(
            runtime.is_configured("bitbucket_username", settings.bitbucket_username) and
            runtime.is_configured("bitbucket_app_password", settings.bitbucket_app_password)
        ),
        bitbucket_server_url=runtime.get_key("bitbucket_server_url", settings.bitbucket_server_url),
    )


@router.post("")
def update_settings(req: SettingsUpdate) -> dict:
    if req.anthropic_api_key is not None:
        runtime.set_key("anthropic_api_key", req.anthropic_api_key)
        from app.integrations import claude_client
        claude_client._client = None

    if req.voyage_api_key is not None:
        runtime.set_key("voyage_api_key", req.voyage_api_key)

    if req.openai_api_key is not None:
        runtime.set_key("openai_api_key", req.openai_api_key)

    if req.default_model is not None:
        runtime.set_key("default_model", req.default_model)

    if req.default_embed_provider is not None:
        runtime.set_key("default_embed_provider", req.default_embed_provider)

    if req.llm_provider is not None:
        runtime.set_key("llm_provider", req.llm_provider)

    if req.ollama_llm_model is not None:
        runtime.set_key("ollama_llm_model", req.ollama_llm_model)

    if req.github_token is not None:
        runtime.set_key("github_token", req.github_token)

    if req.bitbucket_username is not None:
        runtime.set_key("bitbucket_username", req.bitbucket_username)

    if req.bitbucket_app_password is not None:
        runtime.set_key("bitbucket_app_password", req.bitbucket_app_password)

    if req.bitbucket_server_url is not None:
        runtime.set_key("bitbucket_server_url", req.bitbucket_server_url)

    return {"status": "ok"}
