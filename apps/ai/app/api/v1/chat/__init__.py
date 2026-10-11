from fastapi import APIRouter

from app.api.v1.chat.completion import completion_router

chat_router = APIRouter(prefix="/chat", tags=["Chat"])


chat_router.include_router(completion_router)
