from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response

from app.api.identity import OwnerId
from app.api.v1.images.store import load_image

images_router = APIRouter(prefix="/images", tags=["Images"])


@images_router.get("/{image_id}")
async def get_image(image_id: UUID, client_id: OwnerId):
    """A generated image's bytes, for its owner only."""
    image = await load_image(client_id, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(
        content=image.data,
        media_type=image.mime_type,
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )
