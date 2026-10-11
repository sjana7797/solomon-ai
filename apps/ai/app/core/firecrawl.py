"""Self-hosted Firecrawl: web search (via SearXNG) with each result scraped to markdown."""

from __future__ import annotations

import logging

import httpx

from app.api.settings import settings
from app.core.web_search import WebResult

logger = logging.getLogger(__name__)


async def firecrawl_search(query: str, limit: int) -> list[WebResult]:
    async with httpx.AsyncClient(timeout=settings.FIRECRAWL_TIMEOUT_SECONDS + 5) as client:
        res = await client.post(
            f"{settings.FIRECRAWL_URL.rstrip('/')}/v1/search",
            json={
                "query": query,
                "limit": limit,
                "timeout": int(settings.FIRECRAWL_TIMEOUT_SECONDS * 1000),
                "scrapeOptions": {"formats": ["markdown"], "onlyMainContent": True},
            },
        )
        res.raise_for_status()
    payload = res.json()
    data = payload.get("data") or []
    if isinstance(data, dict):  # v2-style {"web": [...]}
        data = data.get("web") or []
    results: list[WebResult] = []
    for item in data:
        url = item.get("url") or (item.get("metadata") or {}).get("sourceURL")
        content = item.get("markdown") or item.get("description") or ""
        if not url or not content.strip():
            continue
        title = item.get("title") or (item.get("metadata") or {}).get("title") or url
        results.append(WebResult(title=" ".join(title.split()), url=url, content=content))
    return results
