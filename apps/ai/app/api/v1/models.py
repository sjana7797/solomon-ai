import httpx
from fastapi import APIRouter, HTTPException

from app.api.settings import settings

models_router = APIRouter(prefix="/models", tags=["Models"])


@models_router.get("")
async def list_models():
    """
    List models available through the LiteLLM proxy.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{settings.LITELLM_BASE_URL}/v1/models",
                headers={"Authorization": f"Bearer {settings.LITELLM_API_KEY}"},
            )
            res.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502, detail="Model gateway unavailable"
        ) from exc
    return {"models": [{"id": m["id"]} for m in res.json().get("data", [])]}
