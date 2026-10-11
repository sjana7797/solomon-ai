from fastapi import APIRouter

from app.api.v1.chat import chat_router
from app.api.v1.documents.router import documents_router
from app.api.v1.images.router import images_router
from app.api.v1.tts.router import tts_router
from app.api.v1.models import models_router

v1_router = APIRouter(
    prefix="/v1",
)


v1_router.include_router(models_router)
v1_router.include_router(chat_router)
v1_router.include_router(documents_router)
v1_router.include_router(images_router)
v1_router.include_router(tts_router)
