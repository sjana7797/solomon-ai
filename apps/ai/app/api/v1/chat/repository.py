from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from app.core.crypto import (
    ChatCipher,
    images_aad,
    message_aad,
    reasoning_aad,
    sources_aad,
    title_aad,
)
from app.core.db.session import db_service
from app.core.db.tables import chats, messages


class ChatOwnershipError(Exception):
    """The chat exists but belongs to a different owner."""


@dataclass(frozen=True)
class UserTurn:
    id: UUID
    content: str
    created_at: datetime


@dataclass(frozen=True)
class AssistantTurn:
    id: UUID
    content: str
    status: Literal["done", "stopped", "error"]
    model: str
    thinking: bool
    reasoning: str
    reasoning_ms: int | None
    web_search: bool
    sources: list[dict]
    images: list[dict]
    error: str | None
    prompt_tokens: int | None
    completion_tokens: int | None
    latency_ms: int
    created_at: datetime


async def get_chat_owner(chat_id: UUID) -> UUID | None:
    async with db_service.session() as session:
        return await session.scalar(select(chats.c.owner_id).where(chats.c.id == chat_id))


async def save_exchange(
    *,
    cipher: ChatCipher,
    chat_id: UUID,
    owner_id: UUID,
    title: str,
    user: UserTurn,
    assistant: AssistantTurn,
) -> None:
    """Persist one user turn + assistant reply. Idempotent on message ids."""
    now = datetime.now(UTC)
    async with db_service.session() as session, session.begin():
        dek, wrapped, key_id = cipher.new_data_key(chat_id)
        created = await session.scalar(
            insert(chats)
            .values(
                id=chat_id,
                owner_id=owner_id,
                title_enc=cipher.encrypt(dek, title, title_aad(chat_id)),
                model=assistant.model,
                dek_wrapped=wrapped,
                dek_key_id=key_id,
                created_at=user.created_at,
                updated_at=now,
            )
            .on_conflict_do_nothing(index_elements=[chats.c.id])
            .returning(chats.c.id)
        )

        row = (
            await session.execute(
                select(chats.c.owner_id, chats.c.dek_wrapped, chats.c.dek_key_id)
                .where(chats.c.id == chat_id)
                .with_for_update()
            )
        ).one()
        if row.owner_id != owner_id:
            raise ChatOwnershipError(str(chat_id))

        if created is None:
            # Existing chat: reuse its data key.
            dek = cipher.unwrap_data_key(chat_id, row.dek_wrapped, row.dek_key_id)
            await session.execute(
                update(chats)
                .where(chats.c.id == chat_id)
                .values(model=assistant.model, updated_at=now)
            )

        await session.execute(
            insert(messages)
            .values(
                [
                    {
                        "id": user.id,
                        "chat_id": chat_id,
                        "role": "user",
                        "status": "done",
                        "content_enc": cipher.encrypt(dek, user.content, message_aad(user.id)),
                        # Multi-row inserts take their columns from the first row,
                        # so every row must list the same keys.
                        "reasoning_enc": None,
                        "thinking": False,
                        "reasoning_ms": None,
                        "web_search": False,
                        "sources_enc": None,
                        "images_enc": None,
                        "model": None,
                        "error": None,
                        "prompt_tokens": None,
                        "completion_tokens": None,
                        "latency_ms": None,
                        "created_at": user.created_at,
                    },
                    {
                        "id": assistant.id,
                        "chat_id": chat_id,
                        "role": "assistant",
                        "status": assistant.status,
                        "content_enc": cipher.encrypt(
                            dek, assistant.content, message_aad(assistant.id)
                        ),
                        "reasoning_enc": (
                            cipher.encrypt(dek, assistant.reasoning, reasoning_aad(assistant.id))
                            if assistant.reasoning
                            else None
                        ),
                        "thinking": assistant.thinking,
                        "reasoning_ms": assistant.reasoning_ms,
                        "web_search": assistant.web_search,
                        "sources_enc": (
                            cipher.encrypt(
                                dek, json.dumps(assistant.sources), sources_aad(assistant.id)
                            )
                            if assistant.sources
                            else None
                        ),
                        "images_enc": (
                            cipher.encrypt(
                                dek, json.dumps(assistant.images), images_aad(assistant.id)
                            )
                            if assistant.images
                            else None
                        ),
                        "model": assistant.model,
                        "error": assistant.error,
                        "prompt_tokens": assistant.prompt_tokens,
                        "completion_tokens": assistant.completion_tokens,
                        "latency_ms": assistant.latency_ms,
                        "created_at": assistant.created_at,
                    },
                ]
            )
            # A retried turn re-sends the same user message id.
            .on_conflict_do_nothing(index_elements=[messages.c.id])
        )
