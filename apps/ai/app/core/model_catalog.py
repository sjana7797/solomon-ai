"""
Catalog of the LiteLLM proxy's models: which can chat, what each is for, and
which accept reasoning effort (the Think toggle). Cached briefly so the chat
stream can check a model's capabilities without a round trip per message.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

from app.api.settings import settings

_CACHE_SECONDS = 60

# LiteLLM model modes that can hold a conversation. Embedding, rerank, image
# and audio models are hidden from the chat model picker.
_CHAT_MODES = {"chat", "completion", "responses"}

# Fallback descriptions by underlying model family, used when the LiteLLM
# model has no `description` in its model info (set one there to override).
_FAMILY_DESCRIPTIONS = (
    ("nemotron-3-ultra", "NVIDIA's Nemotron 3 Ultra (550B MoE, 55B active). Strongest for hard reasoning, research and long multi-step tasks."),
    ("nemotron", "NVIDIA's open Nemotron reasoning model."),
    ("gpt-oss:120b", "OpenAI's open 120B reasoning model. Best for hard questions, research and code; slower."),
    ("gpt-oss:20b", "OpenAI's open 20B reasoning model. Quick, capable everyday answers."),
    ("gpt-oss", "OpenAI's open-weight reasoning model."),
    ("gemma4", "Google's Gemma 4. Fast, multilingual everyday chat."),
    ("gemma", "Google's open Gemma model. Fast everyday chat."),
    ("qwen", "Alibaba's Qwen model. Strong multilingual chat and code."),
    ("llama3.2:1b", "Meta's Llama 3.2 1B, running on this Mac. Fastest replies; best for short, simple tasks."),
    ("llama3.2:3b", "Meta's Llama 3.2 3B, running locally. Quick, light everyday chat."),
    ("llama", "Meta's open Llama model. General-purpose chat."),
)
_REASONING_FAMILIES = ("gpt-oss", "qwen3", "deepseek-r1", "nemotron")


def _describe(model_info: dict, underlying: str) -> str:
    if description := (model_info.get("description") or "").strip():
        return description
    name = underlying.split("/")[-1].lower()
    for family, description in _FAMILY_DESCRIPTIONS:
        if family in name:
            return description
    return f"Chat model ({underlying.split('/')[-1]})."


def _supports_reasoning(model_info: dict, underlying: str) -> bool:
    if model_info.get("supports_reasoning"):
        return True
    if "reasoning_effort" in (model_info.get("supported_openai_params") or []):
        return True
    return any(family in underlying.lower() for family in _REASONING_FAMILIES)


@dataclass(frozen=True)
class ChatModel:
    id: str
    description: str
    reasoning: bool


_cache: tuple[float, list[ChatModel]] | None = None


async def list_chat_models(*, fresh: bool = False) -> list[ChatModel]:
    """Chat-capable models from LiteLLM `/model/info` (raises httpx.HTTPError)."""
    global _cache
    if not fresh and _cache and time.monotonic() - _cache[0] < _CACHE_SECONDS:
        return _cache[1]
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{settings.LITELLM_BASE_URL}/model/info",
            headers={"Authorization": f"Bearer {settings.LITELLM_API_KEY}"},
        )
        res.raise_for_status()
    seen: set[str] = set()
    models: list[ChatModel] = []
    for entry in res.json().get("data", []):
        name = entry.get("model_name")
        info = entry.get("model_info") or {}
        mode = info.get("mode")
        underlying = (entry.get("litellm_params") or {}).get("model") or ""
        # No mode recorded (e.g. a config-file model) → assume it can chat.
        if not name or name in seen or (mode and mode not in _CHAT_MODES):
            continue
        seen.add(name)
        models.append(
            ChatModel(name, _describe(info, underlying), _supports_reasoning(info, underlying))
        )
    _cache = (time.monotonic(), models)
    return models


async def supports_reasoning(model: str) -> bool:
    """Whether to send reasoning effort to `model`; True if the catalog is unreachable
    (the stream retries without it if the model rejects it)."""
    try:
        models = await list_chat_models()
    except httpx.HTTPError:
        return True
    return next((m.reasoning for m in models if m.id == model), True)
