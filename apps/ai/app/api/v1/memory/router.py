from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.identity import OwnerId
from app.api.v1.memory.store import (
    clear_memories,
    delete_memory,
    is_enabled,
    list_memories,
    set_enabled,
)

memory_router = APIRouter(prefix="/memory", tags=["Memory"])



class MemorySettings(BaseModel):
    enabled: bool


@memory_router.get("")
async def get_memory(client_id: OwnerId):
    """Whether memory is on, and everything remembered about this user."""
    return {
        "enabled": await is_enabled(client_id),
        "memories": [m.to_json() for m in await list_memories(client_id)],
    }


@memory_router.put("/settings")
async def update_settings(body: MemorySettings, client_id: OwnerId):
    await set_enabled(client_id, body.enabled)
    return {"enabled": body.enabled}


@memory_router.delete("/{memory_id}", status_code=204)
async def remove_memory(memory_id: UUID, client_id: OwnerId):
    if not await delete_memory(client_id, memory_id):
        raise HTTPException(status_code=404, detail="Memory not found")


@memory_router.delete("")
async def forget_everything(client_id: OwnerId):
    return {"deleted": await clear_memories(client_id)}
