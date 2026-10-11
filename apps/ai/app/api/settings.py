from __future__ import annotations

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.common.enum import ENVEnum

DEFAULT_PORT = 3000
DEFAULT_ORIGIN = "*"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    ENV: ENVEnum = Field(default=ENVEnum.DEVELOPMENT, env="ENV")
    PORT: int = DEFAULT_PORT
    HOST: str = "127.0.0.1"
    ORIGINS: str = DEFAULT_ORIGIN

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/app"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_ECHO: bool = False

    REDIS_URL: str = "redis://localhost:6379/0"

    # LiteLLM proxy (docker-compose `litellm` service, OpenAI-compatible)
    LITELLM_BASE_URL: str = "http://localhost:4000"
    LITELLM_API_KEY: str = ""
    # Model used for chat titles; empty means "use the chat's own model".
    TITLE_MODEL: str = ""

    # Web search (Ollama web search API) + RAG
    OLLAMA_API_URL: str = "https://ollama.com"
    OLLAMA_API_KEY: str = ""
    EMBEDDING_MODEL: str = "mnemosyne"  # LiteLLM model_name
    WEB_SEARCH_MAX_RESULTS: int = 5
    RAG_TOP_K: int = 8

    # Web search + scraping (self-hosted Firecrawl backed by SearXNG); falls
    # back to the Ollama web search API when Firecrawl is unavailable.
    # "firecrawl" (Firecrawl → Ollama fallback) or "ollama" (Ollama web search only).
    WEB_SEARCH_PROVIDER: str = "firecrawl"
    FIRECRAWL_URL: str = "http://localhost:3002"
    FIRECRAWL_TIMEOUT_SECONDS: float = 25

    # Local Ollama: `laya` decision model (routing/grading) and the reranker.
    OLLAMA_LOCAL_URL: str = "http://localhost:11434"
    ROUTER_MODEL: str = "laya"
    # Reranker: "laya" (light, default), "qwen" (Qwen3-Reranker via Ollama), "none".
    RERANK_BACKEND: str = "laya"
    # For RERANK_BACKEND=qwen: 4B Q4_K_M (~2.9 GB with num_ctx 2048). The 0.6B
    # Q8_0 build returns garbage scores in Ollama; 0.6B F16 is untested.
    RERANK_MODEL: str = "dengcao/Qwen3-Reranker-4B:Q4_K_M"
    # Passages gathered before reranking down to RAG_TOP_K.
    RAG_CANDIDATES: int = 12

    # Local image generation via mflux (Apple MLX): FLUX.2 Klein 4B, 4-bit (~4.6 GB).
    IMAGE_MODEL: str = "mflux-community/flux2-klein-4b-mflux-q4"
    IMAGE_SIZE: int = 768
    IMAGE_STEPS: int = 4  # Klein is distilled for ~4 steps
    IMAGE_IDLE_UNLOAD_SECONDS: int = 300

    # Read aloud: Kokoro-82M via mlx-audio (Apple MLX), ~13x faster than real time.
    TTS_MODEL: str = "mlx-community/Kokoro-82M-bf16"
    TTS_VOICE: str = "af_heart"
    TTS_IDLE_UNLOAD_SECONDS: int = 600

    # Image search (SearXNG, docker-compose `searxng` service)
    SEARXNG_URL: str = "http://localhost:8080"
    IMAGE_SEARCH_MAX_RESULTS: int = 6

    # Field-level chat encryption master keys: "key_id:base64(32 bytes)", comma-separated.
    # New chats are wrapped with CHAT_ENCRYPTION_ACTIVE_KEY_ID; older ids stay for decryption.
    CHAT_ENCRYPTION_KEYS: str = ""
    CHAT_ENCRYPTION_ACTIVE_KEY_ID: str = ""


settings = Settings()
