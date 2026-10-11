"""
Passage reranking, pluggable via settings.RERANK_BACKEND:

- "laya" (default): the `laya` decision model scores every passage in one call
  (~0.2-0.5 s, <1 GB) — right for a laptop running the whole stack.
- "qwen": Qwen3-Reranker cross-encoder via local Ollama — better ranking but a
  multi-GB model; use on machines with spare RAM/GPU.
- "none": keep retrieval order.

Qwen3-Reranker notes:
Ollama has no /rerank endpoint, so each (query, passage) pair is scored with
the model's own yes/no relevance prompt through /api/generate, and the score
is P("yes") from the first token's logprobs. Returns None when the reranker is
unavailable so callers can keep their existing order.
"""

from __future__ import annotations

import asyncio
import logging
import math

import httpx

from app.api.settings import settings
from app.core.decisions import decide

logger = logging.getLogger(__name__)

_INSTRUCTION = "Given a user question, judge whether the passage helps answer it"
_MAX_PASSAGE_CHARS = 1200
_CONCURRENCY = 4
_TIMEOUT_SECONDS = 20

# Prompt format from the Qwen3-Reranker model card.
_PROMPT = (
    "<|im_start|>system\n"
    'Judge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".'
    "<|im_end|>\n"
    "<|im_start|>user\n"
    "<Instruct>: {instruction}\n<Query>: {query}\n<Document>: {document}"
    "<|im_end|>\n"
    "<|im_start|>assistant\n<think>\n\n</think>\n\n"
)


def _yes_probability(top_logprobs: list[dict]) -> float | None:
    yes = no = None
    for entry in top_logprobs:
        token = entry.get("token", "").strip().lower()
        if token == "yes" and yes is None:
            yes = entry["logprob"]
        elif token == "no" and no is None:
            no = entry["logprob"]
    if yes is None and no is None:
        return None
    p_yes = math.exp(yes) if yes is not None else 0.0
    p_no = math.exp(no) if no is not None else 0.0
    return p_yes / (p_yes + p_no) if p_yes + p_no else None


async def _score(client: httpx.AsyncClient, query: str, passage: str) -> float:
    res = await client.post(
        f"{settings.OLLAMA_LOCAL_URL.rstrip('/')}/api/generate",
        json={
            "model": settings.RERANK_MODEL,
            "prompt": _PROMPT.format(
                instruction=_INSTRUCTION, query=query, document=passage[:_MAX_PASSAGE_CHARS]
            ),
            "raw": True,
            "stream": False,
            "keep_alive": "30m",  # avoid a ~10 s reload between questions
            "logprobs": True,
            "top_logprobs": 10,
            # Small context: a query + one passage fits easily, and Qwen3's
            # default window would reserve several GB for nothing.
            "options": {"num_predict": 1, "temperature": 0, "num_ctx": 2048},
        },
    )
    res.raise_for_status()
    body = res.json()
    first = (body.get("logprobs") or [{}])[0]
    score = _yes_probability(first.get("top_logprobs") or [first])
    if score is None:
        # No logprobs: fall back to the generated token itself.
        score = 1.0 if body.get("response", "").strip().lower().startswith("yes") else 0.0
    return score


_LAYA_MAX_PASSAGE_CHARS = 1000  # laya has a 512-token budget per question


async def _rerank_laya(query: str, passages: list[str]) -> list[float]:
    answers = await decide(
        f"Query: {query[:500]}",
        {
            f"p{i}": {
                "type": "noul",
                "instructions": "Does this passage help answer the query? Passage: "
                + passage[:_LAYA_MAX_PASSAGE_CHARS],
            }
            for i, passage in enumerate(passages[:64])
        },
        timeout=10,
    )
    return [answers[f"p{i}"]["noul"] for i in range(len(passages[:64]))]


async def rerank(query: str, passages: list[str]) -> list[float] | None:
    """Relevance score (0–1) per passage, or None if the reranker is unavailable."""
    if not passages:
        return []
    if settings.RERANK_BACKEND == "none":
        return None
    if settings.RERANK_BACKEND == "laya":
        try:
            return await _rerank_laya(query, passages)
        except Exception as exc:
            logger.warning("laya reranking unavailable (%s); keeping retrieval order", exc)
            return None
    return await _rerank_qwen(query, passages)


async def _rerank_qwen(query: str, passages: list[str]) -> list[float] | None:
    semaphore = asyncio.Semaphore(_CONCURRENCY)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:

            async def one(passage: str) -> float:
                async with semaphore:
                    return await _score(client, query, passage)

            scores = list(await asyncio.gather(*(one(p) for p in passages)))
    except Exception as exc:
        logger.warning("Reranker unavailable (%s); keeping retrieval order", exc)
        return None
    if len(scores) > 1 and max(scores) - min(scores) < 1e-6:
        # A broken model build scores everything the same (seen with
        # Qwen3-Reranker-0.6B:Q8_0); reordering on that would be noise.
        logger.warning("Reranker %s returned flat scores; ignoring it", settings.RERANK_MODEL)
        return None
    return scores
