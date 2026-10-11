from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse

from app.api.v1.ai.schemas import AIPromptRequest
from app.api.v1.ai.services import get_ai_response
from app.api.v1.chat.repository import get_chat_owner
from app.common.header_enum import ContentTypeEnum

completion_router = APIRouter(
    prefix="/completion",
)


@completion_router.post("")
async def create_completion(
    ai_prompt_request: AIPromptRequest,
    # Anonymous browser id until auth exists; owns the stored chats.
    client_id: Annotated[UUID, Header(alias="X-Client-Id")],
):
    owner = await get_chat_owner(ai_prompt_request.chat_id)
    if owner is not None and owner != client_id:
        raise HTTPException(status_code=404, detail="Chat not found")

    return StreamingResponse(
        content=get_ai_response(ai_prompt_request, client_id),
        media_type=ContentTypeEnum.TEXT_EVENT_STREAM,
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
