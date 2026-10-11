from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.api.identity import OwnerId
from app.api.v1.ai.schemas import AIPromptRequest
from app.api.v1.ai.services import get_ai_response
from app.api.v1.chat.repository import get_chat_owner
from app.api.v1.chat.runs import read_run, run_owner, start_run, stop_run
from app.common.header_enum import ContentTypeEnum

completion_router = APIRouter(
    prefix="/completion",
)


_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _stream(run_id: UUID, after: str = "0-0") -> StreamingResponse:
    return StreamingResponse(
        content=read_run(run_id, after),
        media_type=ContentTypeEnum.TEXT_EVENT_STREAM,
        headers=_SSE_HEADERS,
    )


@completion_router.post("")
async def create_completion(ai_prompt_request: AIPromptRequest, client_id: OwnerId):
    """Start a reply and stream it. Generation runs in the background, so if the
    connection drops, reconnect with GET /completion/{assistant_message_id}/stream."""
    owner = await get_chat_owner(ai_prompt_request.chat_id)
    if owner is not None and owner != client_id:
        raise HTTPException(status_code=404, detail="Chat not found")

    run_id = ai_prompt_request.assistant_message_id
    existing = await run_owner(run_id)
    if existing is not None and existing != client_id:
        raise HTTPException(status_code=404, detail="Reply not found")
    if existing is None:
        await start_run(run_id, client_id, get_ai_response(ai_prompt_request, client_id))
    return _stream(run_id)


@completion_router.get("/{run_id}/stream")
async def resume_completion(
    run_id: UUID,
    client_id: OwnerId,
    after: Annotated[str, Query(pattern=r"^\d+-\d+$")] = "0-0",
):
    """Replay a reply's events from `after` (the start by default) and follow it
    live. 404 once the reply has expired (an hour after it finished)."""
    if await run_owner(run_id) != client_id:
        raise HTTPException(status_code=404, detail="Reply not found")
    return _stream(run_id, after)


@completion_router.post("/{run_id}/stop", status_code=204)
async def stop_completion(run_id: UUID, client_id: OwnerId):
    if await run_owner(run_id) != client_id:
        raise HTTPException(status_code=404, detail="Reply not found")
    stop_run(run_id)
