"""
RAG as a LangGraph graph:

    plan ─┬─ none ───────────────────────────────────────────────┐
          ├─ docs ───────────────────▶ retrieve                   │
          └─ web ──▶ search_web ─────▶ retrieve ─▶ rerank ─▶ grade ┤
                         ▲                                    │    │
                         └──────── rewrite (once) ◀─ weak ────┘    ▼
                                                              finalize ─▶ END

- plan: route the turn. The Search toggle forces web; otherwise the `laya`
  decision model routes in ~65 ms, with one LLM call only for borderline cases
  (auto-search). Attached documents are always used.
- search_web: Firecrawl (SearXNG-backed, pages scraped to markdown), falling
  back to Ollama web search; SearXNG images in parallel on the first pass.
- retrieve: pgvector cache + attached documents → candidate passages.
- rerank: Qwen3-Reranker via local Ollama; keeps retrieval order if missing.
- grade: `laya` judges whether the top passages answer the question; if not,
  rewrite the query and search once more.

Progress is emitted as custom stream events (`status`, `images`, `sources`)
that the chat stream forwards to the browser unchanged. Answer generation stays
outside the graph so reasoning/token streaming is untouched.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from app.api.settings import settings
from app.api.v1.ai.rag import (
    Passage,
    build_context,
    build_image_query,
    build_search_query,
    cache_pages_in_background,
    gather_passages,
)
from app.api.v1.ai.schemas import ChatMessage
from app.api.v1.documents.store import DocumentInfo
from app.core.decisions import decide
from app.core.image_search import image_search
from app.core.llm import get_chat_model
from app.core.rerank import rerank
from app.core.web_search import WebResult, web_search

logger = logging.getLogger(__name__)

Route = Literal["web", "docs", "none"]

# laya routing thresholds (tuned on a small labelled set; see PR notes).
_WEB_SURE = 0.5  # max(fresh, lookup) above this and above `general` → search
_WEB_MAYBE = 0.3  # between MAYBE and SURE → ask the chat model
# Retry only when laya is fairly sure the passages miss; a retry doubles the work.
_GRADE_THRESHOLD = 0.25


class RagState(TypedDict, total=False):
    messages: list[ChatMessage]
    model: str
    force_web: bool
    attached: list[DocumentInfo]
    use_web: bool
    query: str
    attempt: int
    results: list[WebResult]
    passages: list[Passage]
    sufficient: bool
    sources: list[dict]
    system_prompt: str


# ------------------------------------------------------------------ routing


async def _llm_needs_web(message: str, model: str) -> bool:
    response = await get_chat_model(model, temperature=0).ainvoke(
        [
            SystemMessage(
                "Decide if answering the user's message requires searching the web for "
                "current or specific factual information. Reply with exactly 'yes' or 'no'."
            ),
            HumanMessage(message[:1000]),
        ]
    )
    return str(response.text).strip().lower().startswith("y")


async def needs_web(message: str, model: str) -> bool:
    """Auto-search decision: laya fast path, LLM only for borderline cases."""
    try:
        answers = await decide(
            message[:1500],
            {
                "fresh": {
                    "type": "noul",
                    "instructions": "Does this message ask about something recent, current, live or time-sensitive (news, scores, prices, latest releases, today, this week)?",
                },
                "lookup": {
                    "type": "noul",
                    "instructions": "Would a careful assistant need to look up facts on the internet to answer this accurately (specific real people, companies, products, events, statistics, places, laws, prices)?",
                },
                "general": {
                    "type": "noul",
                    "instructions": "Can this be answered fully from general knowledge, reasoning, writing or coding skill, without looking anything up?",
                },
            },
        )
        signal = max(answers["fresh"]["noul"], answers["lookup"]["noul"])
        general = answers["general"]["noul"]
        if signal > _WEB_SURE and signal > general:
            return True
        if signal < _WEB_MAYBE:
            return False
    except Exception as exc:
        logger.warning("laya routing unavailable (%s); asking the LLM", exc)
    try:
        return await _llm_needs_web(message, model)
    except Exception as exc:
        logger.warning("LLM routing failed (%s); not searching", exc)
        return False


async def plan(state: RagState) -> RagState:
    write = get_stream_writer()
    latest = state["messages"][-1].content
    use_web = state.get("force_web", False) or await needs_web(latest, state["model"])
    if not use_web and not state.get("attached"):
        return {"use_web": False}
    write({"type": "status", "stage": "searching" if use_web else "reading"})
    query = await build_search_query(state["messages"], state["model"])
    return {"use_web": use_web, "query": query, "attempt": 0}


def route_after_plan(state: RagState) -> Route:
    if state.get("use_web"):
        return "web"
    return "docs" if state.get("attached") else "none"


# --------------------------------------------------------------- retrieval


async def search_web_node(state: RagState) -> RagState:
    write = get_stream_writer()
    query = state["query"]
    images_task = None
    if state.get("attempt", 0) == 0:
        images_task = asyncio.create_task(
            image_search(await build_image_query(query, state["model"]))
        )
    try:
        results = await web_search(query)
    except Exception as exc:
        # e.g. rate-limited: still answer from attached documents.
        logger.warning("Web search failed: %s", exc)
        results = []
    write({"type": "status", "stage": "reading", "query": query, "count": len(results)})
    if images_task is not None:
        try:
            images = [image.to_event() for image in await images_task]
            if images:
                write({"type": "images", "images": images})
        except Exception as exc:
            logger.warning("Image search failed: %s", exc)
    return {"results": results}


async def retrieve_node(state: RagState) -> RagState:
    passages = await gather_passages(
        state["query"],
        state.get("results", []),
        state.get("attached", []),
        settings.RAG_CANDIDATES,
    )
    return {"passages": passages}


# Final ranking blends the reranker with retrieval similarity: the reranker
# judges relevance, similarity keeps passages that mention the specifics.
_RERANK_WEIGHT = 0.6


async def rerank_node(state: RagState) -> RagState:
    passages = state.get("passages", [])
    scores = await rerank(state["query"], [p.text for p in passages])
    if scores is None:  # reranker unavailable: keep retrieval order
        return {"passages": passages[: settings.RAG_TOP_K]}
    retrieval = [p.score for p in passages]
    low, high = min(retrieval, default=0.0), max(retrieval, default=0.0)
    span = (high - low) or 1.0
    blended = [
        _RERANK_WEIGHT * score + (1 - _RERANK_WEIGHT) * (p.score - low) / span
        for score, p in zip(scores, passages, strict=True)
    ]
    ranked = [
        p
        for _, p in sorted(
            zip(blended, passages, strict=True), key=lambda x: x[0], reverse=True
        )
    ]
    return {"passages": ranked[: settings.RAG_TOP_K]}


async def grade_node(state: RagState) -> RagState:
    """Do the top passages actually answer the question? (laya, ~65 ms)"""
    passages = state.get("passages", [])
    if not passages:
        return {"sufficient": False}
    evidence = "\n\n".join(p.text[:400] for p in passages[:3])
    try:
        answers = await decide(
            f"Question: {state['messages'][-1].content[:500]}\n\nPassages:\n{evidence}",
            {
                "answers": {
                    "type": "noul",
                    "instructions": "Do the passages contain the information needed to answer the question?",
                }
            },
        )
        return {"sufficient": answers["answers"]["noul"] >= _GRADE_THRESHOLD}
    except Exception as exc:
        logger.warning("Grading unavailable (%s); accepting passages", exc)
        return {"sufficient": True}


def route_after_grade(state: RagState) -> Literal["rewrite", "finalize"]:
    retry = (
        not state.get("sufficient", True)
        and state.get("use_web")
        and state.get("attempt", 0) == 0
    )
    return "rewrite" if retry else "finalize"


async def rewrite_node(state: RagState) -> RagState:
    write = get_stream_writer()
    try:
        response = await get_chat_model(state["model"], temperature=0).ainvoke(
            [
                SystemMessage(
                    f"Today is {date.today():%d %B %Y}. The previous web search didn't find "
                    "what was needed. Write one better, more specific web search query for the "
                    "user's question. Don't add years unless the user asked about one. "
                    "Reply with only the query."
                ),
                HumanMessage(
                    f"Question: {state['messages'][-1].content}\nPrevious query: {state['query']}"
                ),
            ]
        )
        query = str(response.text).strip().strip("\"'") or state["query"]
    except Exception as exc:
        logger.warning("Query rewrite failed: %s", exc)
        query = state["query"]
    write({"type": "status", "stage": "searching", "query": query})
    return {"query": query, "attempt": state.get("attempt", 0) + 1}


async def finalize_node(state: RagState) -> RagState:
    # Retrieval is done; cache this turn's pages for future questions.
    cache_pages_in_background(state.get("results", []))
    context = build_context(state.get("passages", []))
    sources = [source.to_event() for source in context.sources]
    get_stream_writer()({"type": "sources", "sources": sources})
    return {"sources": sources, "system_prompt": context.system_prompt}


def _build_graph():
    graph = StateGraph(RagState)
    graph.add_node("plan", plan)
    graph.add_node("search_web", search_web_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("rerank", rerank_node)
    graph.add_node("grade", grade_node)
    graph.add_node("rewrite", rewrite_node)
    graph.add_node("finalize", finalize_node)

    graph.add_edge(START, "plan")
    graph.add_conditional_edges(
        "plan", route_after_plan, {"web": "search_web", "docs": "retrieve", "none": END}
    )
    graph.add_edge("search_web", "retrieve")
    graph.add_edge("retrieve", "rerank")
    graph.add_edge("rerank", "grade")
    graph.add_conditional_edges(
        "grade", route_after_grade, {"rewrite": "rewrite", "finalize": "finalize"}
    )
    graph.add_edge("rewrite", "search_web")
    graph.add_edge("finalize", END)
    return graph.compile()


rag_graph = _build_graph()
