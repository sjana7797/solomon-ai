import asyncio
import json
import logging
import time
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from app.api.settings import settings
from app.api.v1.ai.intent import wants_image
from app.api.v1.ai.rag_graph import rag_graph
from app.api.v1.ai.schemas import AIPromptRequest
from app.api.v1.ai.title import TITLE_TIMEOUT_SECONDS, generate_title
from app.api.v1.chat.repository import AssistantTurn, UserTurn, save_exchange
from app.api.v1.documents.store import list_uploads
from app.api.v1.images.store import save_image
from app.core.image_gen import GeneratedImage, ImageProgress, generate_image
from app.core.background import spawn_background
from app.core.crypto import get_chat_cipher
from app.core.llm import stream_chat_completion

logger = logging.getLogger(__name__)


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


async def _resolve_title(task: asyncio.Task[str | None] | None, fallback: str) -> str:
    if task is None:
        return fallback
    try:
        return await asyncio.wait_for(asyncio.shield(task), TITLE_TIMEOUT_SECONDS) or fallback
    except Exception:
        return fallback


async def _save(
    *,
    ai_prompt_request: AIPromptRequest,
    owner_id: UUID,
    title_task: asyncio.Task[str | None] | None,
    user: UserTurn,
    assistant: AssistantTurn,
) -> None:
    await save_exchange(
        cipher=get_chat_cipher(),
        chat_id=ai_prompt_request.chat_id,
        owner_id=owner_id,
        # Generated title for new chats, else the client's (only used on create).
        title=await _resolve_title(title_task, ai_prompt_request.title),
        user=user,
        assistant=assistant,
    )


async def get_ai_response(ai_prompt_request: AIPromptRequest, owner_id: UUID):
    """Stream the model reply as SSE events (`status`*/`images`?/`sources` when searching,
    `reasoning`*, `delta`*, `title`?, then `done` or `error`), then persist the
    exchange — including stopped or failed replies.

    Retrieval runs through the RAG graph (rag_graph.py): the Search toggle
    forces web search, otherwise the router decides (auto-search); attached
    documents are always searched. Reranked passages become numbered sources
    the model cites inline as [n].

    With `thinking` on, the model runs at high reasoning effort and its
    reasoning is streamed as `reasoning` events; otherwise effort is low and
    reasoning is not shown. On a chat's first turn, a title is generated
    alongside the reply and sent as a `title` event as soon as it's ready."""
    received_at = datetime.now(UTC)
    started = time.monotonic()
    thinking = ai_prompt_request.thinking
    messages = [m.model_dump() for m in ai_prompt_request.messages]
    query = ai_prompt_request.messages[-1].content
    # First turn of a chat (decided from the conversation, not the DB, so it
    # doesn't race with the previous turn's background save).
    is_first_turn = sum(m.role == "user" for m in ai_prompt_request.messages) == 1
    title_task = (
        asyncio.create_task(generate_title(query, ai_prompt_request.model))
        if is_first_turn
        else None
    )
    title_sent = False

    def title_event() -> str | None:
        nonlocal title_sent
        if title_sent or title_task is None or not title_task.done():
            return None
        title_sent = True
        title = title_task.result()
        return _sse({"type": "title", "title": title}) if title else None

    content = ""
    reasoning = ""
    reasoning_started: float | None = None
    reasoning_ms: int | None = None
    status: Literal["done", "stopped", "error"] = "error"
    error: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    sources: list[dict] = []
    images: list[dict] = []
    used_web = False
    try:
        latest = ai_prompt_request.messages[-1].content
        make_image = ai_prompt_request.image or (
            not ai_prompt_request.web_search
            and not ai_prompt_request.document_ids
            and await wants_image(latest)
        )
        if make_image:
            yield _sse({"type": "image", "status": "generating", "prompt": latest})
            async for part in generate_image(latest):
                if isinstance(part, ImageProgress):
                    yield _sse(
                        {"type": "image", "status": "generating", "progress": part.completed / part.total}
                    )
                elif isinstance(part, GeneratedImage):
                    image_id = await save_image(
                        owner_id=owner_id,
                        chat_id=ai_prompt_request.chat_id,
                        message_id=ai_prompt_request.assistant_message_id,
                        model=settings.IMAGE_MODEL,
                        prompt=latest,
                        mime_type=part.mime_type,
                        width=part.width,
                        height=part.height,
                        seed=part.seed,
                        data=part.data,
                    )
                    # Kept in history so later turns know an image was made.
                    content = f"[Generated image: {latest}]"
                    yield _sse(
                        {
                            "type": "image",
                            "status": "complete",
                            "id": str(image_id),
                            "width": part.width,
                            "height": part.height,
                            "prompt": latest,
                        }
                    )
            if title_task is not None:
                await _resolve_title(title_task, "")
                if event := title_event():
                    yield event
            status = "done"
            yield _sse({"type": "done"})
            return

        attached = (
            [d for d in await list_uploads(owner_id, ai_prompt_request.document_ids) if d.status == "ready"]
            if ai_prompt_request.document_ids
            else []
        )
        # RAG graph (route → search → retrieve → rerank → grade); its progress
        # events go straight to the browser.
        try:
            final: dict = {}
            async for mode, chunk in rag_graph.astream(
                {
                    "messages": ai_prompt_request.messages,
                    "model": ai_prompt_request.model,
                    "force_web": ai_prompt_request.web_search,
                    "attached": attached,
                },
                stream_mode=["custom", "values"],
            ):
                if mode == "custom":
                    if chunk.get("type") == "images":
                        images = chunk["images"]
                    yield _sse(chunk)
                else:
                    final = chunk
            sources = final.get("sources", [])
            used_web = bool(final.get("use_web"))
            if final.get("system_prompt"):
                messages = [{"role": "system", "content": final["system_prompt"]}, *messages]
        except Exception as exc:
            # Answer without sources rather than failing the whole reply.
            logger.warning("Retrieval failed: %s", exc)
            if ai_prompt_request.web_search or attached:
                yield _sse({"type": "sources", "sources": []})

        async for part in stream_chat_completion(
            ai_prompt_request.model,
            messages,
            reasoning_effort="high" if thinking else "low",
            temperature=ai_prompt_request.temperature,
            max_tokens=ai_prompt_request.max_tokens,
        ):
            if part.kind == "usage":
                prompt_tokens = part.prompt_tokens
                completion_tokens = part.completion_tokens
            elif part.kind == "reasoning" and thinking:
                reasoning_started = reasoning_started or time.monotonic()
                reasoning += part.text
                yield _sse({"type": "reasoning", "content": part.text})
            elif part.kind == "content":
                if reasoning_started is not None and reasoning_ms is None:
                    reasoning_ms = int((time.monotonic() - reasoning_started) * 1000)
                content += part.text
                yield _sse({"type": "delta", "content": part.text})
            if event := title_event():
                yield event
        if title_task is not None and not title_sent:
            # Reply finished first: give the title a moment so the client gets it.
            await _resolve_title(title_task, "")
            if event := title_event():
                yield event
        status = "done"
        yield _sse({"type": "done"})
    except (asyncio.CancelledError, GeneratorExit):
        # Client disconnected or pressed stop.
        status = "stopped"
        raise
    except Exception as exc:
        logger.exception("Completion failed: %s", exc)
        error = type(exc).__name__
        yield _sse({"type": "error", "message": "The model request failed."})
    finally:
        spawn_background(
            _save(
                ai_prompt_request=ai_prompt_request,
                owner_id=owner_id,
                title_task=title_task,
                user=UserTurn(
                    id=ai_prompt_request.user_message_id,
                    content=ai_prompt_request.messages[-1].content,
                    created_at=received_at,
                ),
                assistant=AssistantTurn(
                    id=ai_prompt_request.assistant_message_id,
                    content=content,
                    status=status,
                    model=ai_prompt_request.model,
                    thinking=thinking,
                    reasoning=reasoning,
                    web_search=ai_prompt_request.web_search or used_web,
                    sources=sources,
                    images=images,
                    reasoning_ms=reasoning_ms
                    if reasoning_ms is not None or reasoning_started is None
                    else int((time.monotonic() - reasoning_started) * 1000),
                    error=error,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    latency_ms=int((time.monotonic() - started) * 1000),
                    created_at=datetime.now(UTC),
                ),
            )
        )
