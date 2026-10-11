from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass

import httpx

from app.api.settings import settings

logger = logging.getLogger(__name__)

_RESOLUTION = re.compile(r"(\d+)\s*[x×]\s*(\d+)")
# Hosts that mostly return document scans, worksheets or social screenshots.
_BLOCKED_HOSTS = ("scribdassets.com", "studocu.com", "lookaside.instagram.com", "lookaside.fbsbx.com")


@dataclass(frozen=True)
class ImageResult:
    url: str
    thumbnail_url: str
    title: str
    source_url: str
    width: int
    height: int

    def to_event(self) -> dict:
        return asdict(self)


async def image_search(query: str, max_results: int | None = None) -> list[ImageResult]:
    """Image search via SearXNG's JSON API. Returns [] if SearXNG is unavailable."""
    limit = max_results or settings.IMAGE_SEARCH_MAX_RESULTS
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{settings.SEARXNG_URL.rstrip('/')}/search",
                params={"q": query, "categories": "images", "format": "json", "safesearch": 1},
            )
            res.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Image search failed: %s", exc)
        return []

    images: list[ImageResult] = []
    seen: set[str] = set()
    for r in res.json().get("results", []):
        url = r.get("img_src") or ""
        # https only (mixed content), and skip duplicates across engines.
        if not url.startswith("https://") or url in seen or any(h in url for h in _BLOCKED_HOSTS):
            continue
        seen.add(url)
        match = _RESOLUTION.search(r.get("resolution") or "")
        width, height = (int(match[1]), int(match[2])) if match else (4, 3)
        images.append(
            ImageResult(
                url=url,
                thumbnail_url=r.get("thumbnail_src") or url,
                title=(r.get("title") or "").strip(),
                source_url=r.get("url") or url,
                width=width,
                height=height,
            )
        )
        if len(images) >= limit:
            break
    return images
