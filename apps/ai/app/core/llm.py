from collections.abc import AsyncIterator
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from langchain_openai import ChatOpenAI
from openai import AsyncOpenAI, OpenAI

from app.api.settings import settings

LITE_LLM_BASE_URL = f"{settings.LITELLM_BASE_URL}/v1"
LITE_LLM_API_KEY = settings.LITELLM_API_KEY


def get_chat_model(model: str, **kwargs) -> ChatOpenAI:
    """Chat model routed through the LiteLLM proxy. `model` is a `model_name` from infra/litellm/config.yaml."""
    return ChatOpenAI(
        model=model,
        base_url=LITE_LLM_BASE_URL,
        api_key=LITE_LLM_API_KEY,
        **kwargs,
    )


def get_chat_models():
    """Return a list of available chat models from the LiteLLM proxy."""
    models = (
        OpenAI(base_url=LITE_LLM_BASE_URL, api_key=LITE_LLM_API_KEY).models.list().data
    )
    return models


ReasoningEffort = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class StreamPart:
    kind: Literal["reasoning", "content", "usage"]
    text: str = ""
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


@lru_cache
def _async_client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=LITE_LLM_BASE_URL, api_key=LITE_LLM_API_KEY)


async def stream_chat_completion(
    model: str,
    messages: list[dict[str, str]],
    *,
    reasoning_effort: ReasoningEffort,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> AsyncIterator[StreamPart]:
    """Stream a completion through the LiteLLM proxy, including reasoning.

    Uses the OpenAI SDK directly because LangChain's ChatOpenAI drops the
    `reasoning_content` deltas LiteLLM sends for reasoning models.
    LiteLLM drops `reasoning_effort` for models that don't support it.
    """
    stream = await _async_client().chat.completions.create(
        model=model,
        messages=messages,  # type: ignore[arg-type]
        stream=True,
        stream_options={"include_usage": True},
        reasoning_effort=reasoning_effort,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    async with stream:
        async for chunk in stream:
            if chunk.usage:
                yield StreamPart(
                    kind="usage",
                    prompt_tokens=chunk.usage.prompt_tokens,
                    completion_tokens=chunk.usage.completion_tokens,
                )
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            reasoning = (delta.model_extra or {}).get("reasoning_content")
            if reasoning:
                yield StreamPart(kind="reasoning", text=reasoning)
            if delta.content:
                yield StreamPart(kind="content", text=delta.content)


async def embed(texts: list[str], *, batch_size: int = 64) -> list[list[float]]:
    """Embed texts with the LiteLLM embedding model (settings.EMBEDDING_MODEL)."""
    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        res = await _async_client().embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=texts[start : start + batch_size],
        )
        vectors.extend(item.embedding for item in sorted(res.data, key=lambda d: d.index))
    return vectors
