"""Client for Ollama decision models (`laya`): typed answers with probabilities
from a single fast forward pass — used for routing and grading in RAG."""

from __future__ import annotations

from typing import Any

import httpx

from app.api.settings import settings


async def decide(state: str, questions: dict[str, dict[str, Any]], *, timeout: float = 5) -> dict:
    """POST /v1/systemone → {"<question>": {"type": ..., "noul"|"choice"|...}}."""
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(
            f"{settings.OLLAMA_LOCAL_URL.rstrip('/')}/v1/systemone",
            json={
                "model": settings.ROUTER_MODEL,
                "state": state,
                "questions": questions,
                "keep_alive": "30m",
            },
        )
        res.raise_for_status()
    return res.json()["answers"]
