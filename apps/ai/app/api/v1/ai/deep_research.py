"""
Deep research as a LangGraph graph:

    plan ─▶ research ─▶ reflect ─┬─ gaps (round < max) ─▶ research
                                 └─ enough ─▶ finalize ─▶ END

- plan: the chat model splits the question into sub-questions plus a report
  outline. SearXNG images run alongside.
- research: each pending sub-question is searched, its passages retrieved and
  reranked like normal RAG, then a fast model turns
  them into short cited notes (RESEARCH_FAST_MODEL). Sources get one global [n] number per page.
- reflect: the fast model reads the notes and adds follow-up sub-questions for
  gaps, within RESEARCH_MAX_ROUNDS / RESEARCH_MAX_STEPS.
- finalize: sources event + the system prompt for writing the report; the
  report itself streams outside the graph like a normal answer.

Progress goes to the browser as `research` events, each a full snapshot
({stage, round, steps}) so the client just replaces its copy.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import date
from typing import Literal, TypedDict
from urllib.parse import urlparse

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from app.api.settings import settings
from app.api.v1.ai.rag import (
    Passage,
    _snippet,
    build_image_query,
    build_search_query,
    cache_pages_in_background,
    gather_passages,
)
from app.api.v1.ai.schemas import ChatMessage
from app.api.v1.documents.store import DocumentInfo
from app.core.image_search import image_search
from app.core.llm import get_chat_model
from app.core.rerank import rerank
from app.core.web_search import WebResult, web_search

logger = logging.getLogger(__name__)

StepStatus = Literal["pending", "searching", "reading", "done", "failed"]


class Step(TypedDict):
    id: str
    question: str
    status: StepStatus
    sources: int


@dataclass
class SourceEntry:
    index: int
    kind: Literal["web", "document"]
    title: str
    url: str
    snippet: str

    def to_event(self) -> dict:
        return {
            "index": self.index,
            "kind": self.kind,
            "title": self.title,
            "url": self.url,
            "domain": urlparse(self.url).netloc.removeprefix("www.") if self.url else "",
            "snippet": self.snippet,
        }


class ResearchState(TypedDict, total=False):
    messages: list[ChatMessage]
    model: str
    attached: list[DocumentInfo]
    question: str
    outline: list[str]
    steps: list[Step]
    notes: dict[str, str]  # step id -> cited notes
    registry: dict[str, SourceEntry]  # source key -> numbered source
    results: list[WebResult]
    round: int
    sources: list[dict]
    system_prompt: str


def _today() -> str:
    return f"{date.today():%d %B %Y}"


def _json(text: str, opener: str = "{", closer: str = "}"):
    start, end = text.find(opener), text.rfind(closer)
    if start == -1 or end <= start:
        raise ValueError("no JSON in reply")
    return json.loads(text[start : end + 1])


def _emit(write, stage: str, state: ResearchState, steps: list[Step]) -> None:
    write(
        {
            "type": "research",
            "stage": stage,
            "round": min(state.get("round", 0) + 1, settings.RESEARCH_MAX_ROUNDS),
            "steps": [dict(step) for step in steps],
        }
    )


async def _ask(model: str, system: str, user: str) -> str:
    response = await get_chat_model(model, temperature=0).ainvoke(
        [SystemMessage(system), HumanMessage(user)]
    )
    return str(response.text).strip()


# ---------------------------------------------------------------------- plan

_PLAN_PROMPT = """You plan deep web research. Today is {today}.
Break the user's question into 3-5 focused sub-questions that together cover it
(background, key facts and numbers, different viewpoints, recent developments),
each written as a standalone web search query. Also outline the final report as
3-6 section headings.

Reply with only JSON: {{"sub_questions": ["..."], "outline": ["..."]}}"""


async def plan_node(state: ResearchState) -> ResearchState:
    write = get_stream_writer()
    _emit(write, "planning", state, [])
    question = await build_search_query(state["messages"], state["model"])

    async def images() -> None:
        try:
            found = await image_search(await build_image_query(question, state["model"]))
            if found:
                write({"type": "images", "images": [image.to_event() for image in found]})
        except Exception as exc:
            logger.warning("Research image search failed: %s", exc)

    images_task = asyncio.create_task(images())
    try:
        plan = _json(
            await _ask(
                state["model"],
                _PLAN_PROMPT.format(today=_today()),
                state["messages"][-1].content[:4000],
            )
        )
        sub_questions = [str(q).strip() for q in plan.get("sub_questions") or [] if str(q).strip()]
        outline = [str(h).strip() for h in plan.get("outline") or [] if str(h).strip()]
    except Exception as exc:
        logger.warning("Research planning failed (%s); researching the question directly", exc)
        sub_questions, outline = [], []
    sub_questions = (sub_questions or [question])[: settings.RESEARCH_MAX_STEPS]
    steps: list[Step] = [
        {"id": f"q{i + 1}", "question": q, "status": "pending", "sources": 0}
        for i, q in enumerate(sub_questions)
    ]
    await images_task
    update: ResearchState = {
        "question": question,
        "outline": outline,
        "steps": steps,
        "notes": {},
        "registry": {},
        "results": [],
        "round": 0,
    }
    _emit(write, "researching", {**state, **update}, steps)
    return update


# ------------------------------------------------------------------ research

_NOTES_PROMPT = """You take research notes. Overall question: {question}
Sub-question: {sub_question}

From the numbered passages, write concise bullet notes that help answer the
sub-question: specific facts, numbers, dates, names and any disagreements.
End every bullet with the passage numbers it comes from, like [3] or [2][5].
Use only the passages. If they don't help, reply exactly: No relevant information."""


async def _search(query: str) -> list[WebResult]:
    for attempt in range(2):
        try:
            return await web_search(query, settings.RESEARCH_RESULTS_PER_QUERY)
        except Exception as exc:  # e.g. rate-limited: one retry
            if attempt:
                raise
            logger.warning("Research search failed (%s); retrying", exc)
            await asyncio.sleep(2)
    return []


async def _top_passages(query: str, passages: list[Passage]) -> list[Passage]:
    scores = await rerank(query, [p.text for p in passages])
    if scores is None:
        return passages[: settings.RESEARCH_PASSAGES_PER_STEP]
    ranked = sorted(zip(scores, passages, strict=True), key=lambda pair: pair[0], reverse=True)
    return [p for _, p in ranked[: settings.RESEARCH_PASSAGES_PER_STEP]]


async def research_node(state: ResearchState) -> ResearchState:
    write = get_stream_writer()
    steps = [dict(step) for step in state["steps"]]  # type: ignore[misc]
    registry = dict(state["registry"])
    notes = dict(state["notes"])
    results = list(state["results"])
    semaphore = asyncio.Semaphore(settings.RESEARCH_CONCURRENCY)

    def number(passage: Passage) -> int:
        entry = registry.get(passage.key)
        if entry is None:
            entry = registry[passage.key] = SourceEntry(
                len(registry) + 1, passage.kind, passage.title, passage.url, _snippet(passage.text)
            )
        return entry.index

    def update(step: dict, **changes) -> None:
        step.update(changes)
        _emit(write, "researching", state, steps)  # type: ignore[arg-type]

    async def one(step: dict) -> None:
        async with semaphore:
            try:
                update(step, status="searching")
                found = await _search(step["question"])
                results.extend(found)
                update(step, status="reading")
                candidates = await gather_passages(
                    step["question"], found, state.get("attached", []), settings.RAG_CANDIDATES
                )
                top = await _top_passages(step["question"], candidates)
                if not top:
                    update(step, status="done", sources=0)
                    return
                numbered = "\n\n".join(f"[{number(p)}] {p.title}\n{p.text[:1500]}" for p in top)
                notes[step["id"]] = await _ask(
                    settings.RESEARCH_FAST_MODEL,
                    _NOTES_PROMPT.format(question=state["question"], sub_question=step["question"]),
                    numbered,
                )
                update(step, status="done", sources=len({p.key for p in top}))
            except Exception as exc:
                logger.warning("Research step %r failed: %s", step["question"], exc)
                update(step, status="failed")

    await asyncio.gather(*(one(step) for step in steps if step["status"] == "pending"))
    return {"steps": steps, "registry": registry, "notes": notes, "results": results}  # type: ignore[typeddict-item]


# ------------------------------------------------------------------- reflect

_REFLECT_PROMPT = """You review research progress. Today is {today}.
Question: {question}
Report outline: {outline}

Given the notes so far, decide whether they cover the question well enough for
a thorough report. If there are important gaps (missing facts, a viewpoint, a
recent development, a number to verify), give up to {limit} new focused web
search queries for them. Don't repeat earlier sub-questions.

Reply with only JSON: {{"enough": true|false, "follow_ups": ["..."]}}"""


def _notes_digest(state: ResearchState) -> str:
    return "\n\n".join(
        f"## {step['question']}\n{state['notes'].get(step['id'], '(no notes)')}"
        for step in state["steps"]
    )


async def reflect_node(state: ResearchState) -> ResearchState:
    write = get_stream_writer()
    steps = list(state["steps"])
    room = settings.RESEARCH_MAX_STEPS - len(steps)
    next_round = state.get("round", 0) + 1
    if room <= 0 or next_round >= settings.RESEARCH_MAX_ROUNDS:
        return {"round": next_round}
    _emit(write, "reflecting", state, steps)
    try:
        # The fast model: with a large reasoning model this step took over a minute.
        verdict = _json(
            await _ask(
                settings.RESEARCH_FAST_MODEL,
                _REFLECT_PROMPT.format(
                    today=_today(),
                    question=state["question"],
                    outline="; ".join(state.get("outline") or []) or "(none)",
                    limit=min(3, room),
                ),
                "Earlier sub-questions:\n"
                + "\n".join(f"- {s['question']}" for s in steps)
                + "\n\nNotes:\n"
                + _notes_digest(state)[:12000],
            )
        )
    except Exception as exc:
        logger.warning("Research reflection failed (%s); writing the report", exc)
        return {"round": next_round}
    asked = {s["question"].lower() for s in steps}
    follow_ups = [
        q
        for q in (str(x).strip() for x in verdict.get("follow_ups") or [])
        if q and q.lower() not in asked
    ][: min(3, room)]
    if verdict.get("enough") or not follow_ups:
        return {"round": next_round}
    steps += [
        {"id": f"q{len(steps) + i + 1}", "question": q, "status": "pending", "sources": 0}
        for i, q in enumerate(follow_ups)
    ]
    state_after: ResearchState = {**state, "round": next_round, "steps": steps}
    _emit(write, "researching", state_after, steps)
    return {"round": next_round, "steps": steps}


def route_after_reflect(state: ResearchState) -> Literal["research", "finalize"]:
    pending = any(step["status"] == "pending" for step in state["steps"])
    return "research" if pending else "finalize"


# ------------------------------------------------------------------ finalize

_REPORT_PROMPT = """You are writing a deep research report. Today is {today}.

Write a thorough, well-structured Markdown report answering the user's question,
using the research notes below:
- Start with a "#" title, then a short summary of the key findings.
- Then "##" sections, following this outline where it fits: {outline}
- End with a "## Conclusion" (and open questions, if any).
- Be specific: include the numbers, dates and names from the notes. Point out
  disagreements or uncertainty between sources.
- Cite sources inline with their numbers in square brackets, like [1] or [2][5],
  right after the facts they support. Use only these numbers; no other citation style
  and no reference list at the end.
- Use only the notes for facts. If something important couldn't be found, say so.

Sources:
{sources}

Research notes:
{notes}"""


async def finalize_node(state: ResearchState) -> ResearchState:
    write = get_stream_writer()
    cache_pages_in_background(state.get("results", []))
    entries = sorted(state["registry"].values(), key=lambda e: e.index)
    sources = [entry.to_event() for entry in entries]
    write({"type": "sources", "sources": sources})
    _emit(write, "writing", state, state["steps"])
    system_prompt = _REPORT_PROMPT.format(
        today=_today(),
        outline="; ".join(state.get("outline") or []) or "your choice",
        sources="\n".join(f"[{e.index}] {e.title} — {e.url or 'uploaded document'}" for e in entries)
        or "(none found)",
        notes=_notes_digest(state)[:30000],
    )
    return {"sources": sources, "system_prompt": system_prompt}


def _build_graph():
    graph = StateGraph(ResearchState)
    graph.add_node("plan", plan_node)
    graph.add_node("research", research_node)
    graph.add_node("reflect", reflect_node)
    graph.add_node("finalize", finalize_node)
    graph.add_edge(START, "plan")
    graph.add_edge("plan", "research")
    graph.add_edge("research", "reflect")
    graph.add_conditional_edges(
        "reflect", route_after_reflect, {"research": "research", "finalize": "finalize"}
    )
    graph.add_edge("finalize", END)
    return graph.compile()


research_graph = _build_graph()
