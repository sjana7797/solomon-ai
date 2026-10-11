import httpx
from fastapi import APIRouter, HTTPException

from app.core.model_catalog import list_chat_models

models_router = APIRouter(prefix="/models", tags=["Models"])


@models_router.get("")
async def list_models():
    """
    List the chat models available through the LiteLLM proxy, with a short
    description and whether the Think toggle applies.
    """
    try:
        models = await list_chat_models(fresh=True)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Model gateway unavailable") from exc
    return {
        "models": [
            {"id": m.id, "description": m.description, "reasoning": m.reasoning}
            for m in models
        ]
    }
