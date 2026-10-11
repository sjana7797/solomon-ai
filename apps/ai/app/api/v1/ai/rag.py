"""
RAG over web results and uploaded documents.

Web pages: pages already in the pgvector cache are searched in Postgres
(hybrid vector + full-text). New pages are ranked in memory for this reply
(keyword pre-filter, then embeddings) and embedded in full in the background
so later questions hit the cache. Uploaded documents are searched the same
way. The best passages become numbered sources the model cites as [n].
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
from collections import Counter
from dataclasses import dataclass
from datetime import date
from typing import Literal
from urllib.parse import urlparse

from langchain_core.messages import HumanMessage, SystemMessage

from app.api.settings import settings
from app.api.v1.ai.schemas import ChatMessage
from app.api.v1.documents.store import (
    DocumentInfo,
    cached_web_documents,
    hybrid_search,
    ingest_web_page,
)
from app.core.background import spawn_background
from app.core.chunking import chunk_text
from app.core.llm import embed, get_chat_model
from app.core.web_search import WebResult

logger = logging.getLogger(__name__)

MAX_CHUNKS_PER_RESULT = 40
# Only the best keyword matches are embedded; embedding every chunk is the
# slowest step of a search reply.
EMBED_CANDIDATES = 48
EMBED_TIMEOUT_SECONDS = 15
_WORD = re.compile(r"\w{3,}")
_HISTORY_TURNS = 6


@dataclass(frozen=True)
class Source:
    """A web page or uploaded document used as context; `index` is the [n]
    citation number. Documents have no url/domain."""

    index: int
    kind: Literal["web", "document"]
    title: str
    url: str
    domain: str
    snippet: str

    def to_event(self) -> dict:
        return {
            "index": self.index,
            "kind": self.kind,
            "title": self.title,
            "url": self.url,
            "domain": self.domain,
            "snippet": self.snippet,
        }


@dataclass(frozen=True)
class RetrievedContext:
    sources: list[Source]
    system_prompt: str


def _snippet(chunk: str, limit: int = 220) -> str:
    """Short plain-text preview of the most relevant passage for a source card."""
    text = re.sub(r"[#*_`>|\[\]]+", " ", chunk)
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def _keyword_scores(query: str, chunks: list[str]) -> list[float]:
    """Cheap lexical relevance (query-term overlap weighted by rarity) used to
    pick embedding candidates, and as the ranking if embeddings fail."""
    terms = set(_WORD.findall(query.lower()))
    if not terms:
        return [0.0] * len(chunks)
    chunk_terms = [Counter(_WORD.findall(chunk.lower())) for chunk in chunks]
    doc_freq = Counter(t for counts in chunk_terms for t in terms if t in counts)
    n = len(chunks)
    return [
        sum(
            math.log(1 + n / doc_freq[t]) * (1 + math.log(counts[t]))
            for t in terms
            if counts[t]
        )
        for counts in chunk_terms
    ]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


async def build_search_query(messages: list[ChatMessage], model: str) -> str:
    """Standalone search query for the latest user turn.

    The first turn is used as-is; follow-ups ("what about 3.14?") are rewritten
    with the conversation as context.
    """
    latest = messages[-1].content
    if sum(m.role == "user" for m in messages) == 1:
        return latest[:400]
    history = "\n".join(
        f"{m.role}: {m.content[:500]}" for m in messages[-_HISTORY_TURNS:-1]
    )
    try:
        response = await get_chat_model(model, temperature=0).ainvoke(
            [
                SystemMessage(
                    f"Today is {date.today():%d %B %Y}. Rewrite the user's latest message as a "
                    "standalone web search query. Don't add years unless the user mentioned one. "
                    "Reply with only the query, no quotes."
                ),
                HumanMessage(f"Conversation:\n{history}\n\nLatest message: {latest}"),
            ]
        )
        query = str(response.text).strip().strip("\"'")
        return query or latest[:400]
    except Exception as exc:
        logger.warning("Search query rewrite failed: %s", exc)
        return latest[:400]


async def build_image_query(search_query: str, model: str) -> str:
    """Short visual-subject query for image search ("golden gate bridge"),
    since full questions return worksheets and screenshots."""
    try:
        response = await get_chat_model(model, temperature=0).ainvoke(
            [
                SystemMessage(
                    "Give a 2 to 5 word image search query naming the main visual subject "
                    "of this request. Reply with only the query, no quotes."
                ),
                HumanMessage(search_query),
            ]
        )
        query = str(response.text).strip().strip("\"'")
        return query or search_query
    except Exception as exc:
        logger.warning("Image query rewrite failed: %s", exc)
        return search_query


@dataclass(frozen=True)
class Passage:
    key: str  # source identity: page url or document id
    kind: Literal["web", "document"]
    title: str
    url: str
    text: str
    score: float


# Pages being embedded in the background, so concurrent replies don't duplicate work.
_ingesting: set[str] = set()
# One page at a time: caching shares the local Ollama GPU with live replies.
_ingest_slot = asyncio.Semaphore(1)


def cache_pages_in_background(results: list[WebResult]) -> None:
    """Embed full pages into the pgvector cache, after the reply's retrieval is done."""
    pending = [r for r in results if r.url not in _ingesting and r.content.strip()]
    if not pending:
        return
    _ingesting.update(r.url for r in pending)

    async def run() -> None:
        try:
            cached = await cached_web_documents([r.url for r in pending])
            for result in pending:
                if result.url in cached:
                    continue
                async with _ingest_slot:
                    await ingest_web_page(result.url, result.title, result.content)
        finally:
            _ingesting.difference_update(r.url for r in pending)

    spawn_background(run())


async def gather_passages(
    query: str,
    results: list[WebResult],
    attached: list[DocumentInfo],
    limit: int,
) -> list[Passage]:
    """Candidate passages from web results and attached documents, best first."""
    cached = await cached_web_documents([r.url for r in results])
    fresh = [r for r in results if r.url not in cached]
    web_by_doc = {doc_id: r for r in results if (doc_id := cached.get(r.url))}
    upload_by_doc = {d.id: d for d in attached}

    # New pages: keyword pre-filter, then embed only the best candidates.
    fresh_chunks = [
        (r, chunk) for r in fresh for chunk in chunk_text(r.content, max_chunks=MAX_CHUNKS_PER_RESULT)
    ]
    lexical = _keyword_scores(query, [c for _, c in fresh_chunks])
    candidates = [
        item
        for item, _ in sorted(
            zip(fresh_chunks, lexical, strict=True), key=lambda pair: pair[1], reverse=True
        )[:EMBED_CANDIDATES]
    ]

    passages: list[Passage] = []
    try:
        vectors = await asyncio.wait_for(
            embed([query] + [c for _, c in candidates]), EMBED_TIMEOUT_SECONDS
        )
        query_vector = vectors[0]
        passages += [
            Passage(r.url, "web", r.title or r.url, r.url, chunk, _cosine(query_vector, vector))
            for (r, chunk), vector in zip(candidates, vectors[1:], strict=True)
        ]
        stored_ids = [*web_by_doc, *upload_by_doc]
        for hit in await hybrid_search(stored_ids, query, query_vector, k=settings.RAG_TOP_K * 2):
            if (page := web_by_doc.get(hit.document_id)) is not None:
                passages.append(
                    Passage(page.url, "web", page.title or page.url, page.url, hit.text, hit.similarity)
                )
            elif (doc := upload_by_doc.get(hit.document_id)) is not None:
                passages.append(
                    Passage(str(doc.id), "document", doc.title, "", hit.text, hit.similarity)
                )
    except Exception as exc:
        # Embeddings or the vector store unavailable: fall back to keyword order.
        logger.warning("Vector retrieval failed, using keyword ranking: %s", exc)
        passages = [
            Passage(r.url, "web", r.title or r.url, r.url, chunk, -rank)
            for rank, (r, chunk) in enumerate(candidates)
        ]

    return sorted(passages, key=lambda p: p.score, reverse=True)[:limit]


def build_context(ranked: list[Passage]) -> RetrievedContext:
    """Number the passages' sources and build the cited-answer system prompt."""
    if not ranked:
        return RetrievedContext(sources=[], system_prompt="")

    # Number sources in order of first appearance among the top passages.
    numbers: dict[str, int] = {}
    first: dict[str, Passage] = {}
    blocks: list[str] = []
    for passage in ranked:
        number = numbers.setdefault(passage.key, len(numbers) + 1)
        first.setdefault(passage.key, passage)
        blocks.append(f"[{number}] {passage.text}")

    sources = [
        Source(
            index=numbers[key],
            kind=p.kind,
            title=p.title,
            url=p.url,
            domain=urlparse(p.url).netloc.removeprefix("www.") if p.url else "",
            snippet=_snippet(p.text),
        )
        for key, p in first.items()
    ]
    source_list = "\n".join(
        f"[{s.index}] {s.title} — {s.url or 'uploaded document'}" for s in sources
    )
    system_prompt = (
        "Answer using the sources below (web results and/or the user's uploaded "
        "documents). Cite sources inline with their number in square brackets, like "
        "[1] or [2][3], right after the facts they support. Use exactly that format — "
        "no other citation styles. If the sources don't answer the question, say so and "
        "answer from your own knowledge, making clear which parts aren't from the sources."
        f"\n\nSources:\n{source_list}\n\nPassages:\n\n" + "\n\n".join(blocks)
    )
    return RetrievedContext(sources=sources, system_prompt=system_prompt)


async def retrieve(
    query: str, results: list[WebResult], attached: list[DocumentInfo] | None = None
) -> RetrievedContext:
    """Single-pass retrieval without reranking (kept for simple callers)."""
    passages = await gather_passages(query, results, attached or [], settings.RAG_TOP_K)
    return build_context(passages)
