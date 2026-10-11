"""Account linking: when a browser signs in, its anonymous data moves to the account."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header
from sqlalchemy import update

from app.api.identity import UserId, anonymous_client_id
from app.api.v1.memory.store import move_memories
from app.core.db.session import db_service
from app.core.db.tables import chats, documents, generated_images

account_router = APIRouter(prefix="/account", tags=["Account"])


@account_router.post("/claim")
async def claim_anonymous_data(
    user_id: UserId,
    client_id: Annotated[UUID, Header(alias="X-Client-Id")],
):
    """Move chats, uploads, generated images and memories owned by this
    browser's anonymous id to the signed-in user. Idempotent."""
    if client_id == user_id:
        return {"chats": 0, "documents": 0, "images": 0, "memories": 0}
    # Only anonymous data can be claimed, never another account's.
    await anonymous_client_id(client_id)
    async with db_service.session() as session, session.begin():
        moved = {}
        for name, table in (("chats", chats), ("documents", documents), ("images", generated_images)):
            result = await session.execute(
                update(table).where(table.c.owner_id == client_id).values(owner_id=user_id)
            )
            moved[name] = result.rowcount
        moved["memories"] = await move_memories(session, client_id, user_id)
    return moved
