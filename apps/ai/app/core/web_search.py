from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from app.api.settings import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class WebResult:
    title: str
    url: str
    content: str


async def ollama_web_search(query: str, max_results: int | None = None) -> list[WebResult]:
    """Search the web via Ollama's web search API (results include page text)."""
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            f"{settings.OLLAMA_API_URL.rstrip('/')}/api/web_search",
            headers={"Authorization": f"Bearer {settings.OLLAMA_API_KEY}"},
            json={
                "query": query,
                "max_results": max_results or settings.WEB_SEARCH_MAX_RESULTS,
            },
        )
        res.raise_for_status()
    return [
        WebResult(
            title=" ".join((r.get("title") or r.get("url") or "").split()),
            url=r["url"],
            content=r.get("content") or "",
        )
        for r in res.json().get("results", [])
        if r.get("url")
    ]


async def web_search(query: str, max_results: int | None = None) -> list[WebResult]:
    """Firecrawl (self-hosted, SearXNG-backed) first with Ollama web search as
    fallback, or Ollama only when WEB_SEARCH_PROVIDER=ollama."""
    # Lazy import: firecrawl.py imports WebResult from this module.
    from app.core.firecrawl import firecrawl_search

    limit = max_results or settings.WEB_SEARCH_MAX_RESULTS
    if settings.WEB_SEARCH_PROVIDER == "ollama":
        return await ollama_web_search(query, limit)
    try:
        results = await firecrawl_search(query, limit)
        if results:
            return results
        logger.warning("Firecrawl returned no results; falling back")
    except Exception as exc:
        logger.warning("Firecrawl search failed (%s); falling back", exc)
    return await ollama_web_search(query, limit)
