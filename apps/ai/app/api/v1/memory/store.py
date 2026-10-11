"""
Long-term memory store: encrypted facts about a user with embeddings
(pgvector), one data key per owner in `memory_profiles`.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert

from app.core.crypto import get_chat_cipher, memory_aad
from app.core.db.session import db_service
from app.core.db.tables import memories, memory_profiles
from app.core.llm import embed

CATEGORIES = ("identity", "preference", "interest", "project", "other")


@dataclass(frozen=True)
class Memory:
    id: UUID
    content: str
    category: str
    source_chat_id: UUID | None
    created_at: datetime
    updated_at: datetime

    def to_json(self) -> dict:
        return {
            "id": str(self.id),
            "content": self.content,
            "category": self.category,
            "source_chat_id": str(self.source_chat_id) if self.source_chat_id else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass(frozen=True)
class MemoryChange:
    op: str  # "add" | "update" | "delete"
    content: str


async def _profile(session, owner_id: UUID, *, create: bool):
    row = (
        await session.execute(select(memory_profiles).where(memory_profiles.c.owner_id == owner_id))
    ).one_or_none()
    if row is None and create:
        _, wrapped, key_id = get_chat_cipher().new_data_key(owner_id)
        await session.execute(
            insert(memory_profiles)
            .values(
                owner_id=owner_id,
                enabled=True,
                dek_wrapped=wrapped,
                dek_key_id=key_id,
                created_at=datetime.now(UTC),
            )
            .on_conflict_do_nothing()
        )
        row = (
            await session.execute(
                select(memory_profiles).where(memory_profiles.c.owner_id == owner_id)
            )
        ).one()
    return row


def _dek(profile) -> bytes:
    return get_chat_cipher().unwrap_data_key(
        profile.owner_id, profile.dek_wrapped, profile.dek_key_id
    )


def _to_memory(dek: bytes, row) -> Memory:
    return Memory(
        id=row.id,
        content=get_chat_cipher().decrypt(dek, row.content_enc, memory_aad(row.id)),
        category=row.category,
        source_chat_id=row.source_chat_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def is_enabled(owner_id: UUID) -> bool:
    """Memory is on unless the owner turned it off."""
    async with db_service.session() as session:
        enabled = await session.scalar(
            select(memory_profiles.c.enabled).where(memory_profiles.c.owner_id == owner_id)
        )
    return enabled is not False


async def set_enabled(owner_id: UUID, enabled: bool) -> None:
    async with db_service.session() as session, session.begin():
        await _profile(session, owner_id, create=True)
        await session.execute(
            update(memory_profiles)
            .where(memory_profiles.c.owner_id == owner_id)
            .values(enabled=enabled)
        )


async def list_memories(owner_id: UUID) -> list[Memory]:
    async with db_service.session() as session:
        profile = await _profile(session, owner_id, create=False)
        if profile is None:
            return []
        rows = await session.execute(
            select(memories)
            .where(memories.c.owner_id == owner_id)
            .order_by(memories.c.updated_at.desc())
        )
        dek = _dek(profile)
        return [_to_memory(dek, row) for row in rows]


async def search_memories(
    owner_id: UUID, query_vector: list[float], k: int
) -> list[tuple[Memory, float]]:
    """Most similar memories to the query vector, with cosine similarity."""
    distance = memories.c.embedding.cosine_distance(query_vector)
    async with db_service.session() as session:
        profile = await _profile(session, owner_id, create=False)
        if profile is None:
            return []
        rows = await session.execute(
            select(memories, (1 - distance).label("similarity"))
            .where(memories.c.owner_id == owner_id)
            .order_by(distance)
            .limit(k)
        )
        dek = _dek(profile)
        return [(_to_memory(dek, row), float(row.similarity)) for row in rows]


async def count_memories(owner_id: UUID) -> int:
    async with db_service.session() as session:
        return await session.scalar(
            select(func.count()).select_from(memories).where(memories.c.owner_id == owner_id)
        ) or 0


async def apply_changes(
    owner_id: UUID,
    *,
    add: list[tuple[str, str]],
    update_: list[tuple[UUID, str, str]],
    remove: list[UUID],
    source_chat_id: UUID | None,
) -> None:
    """add: (content, category); update_: (id, content, category); remove: ids."""
    texts = [content for content, _ in add] + [content for _, content, _ in update_]
    vectors = await embed(texts) if texts else []
    cipher = get_chat_cipher()
    now = datetime.now(UTC)
    async with db_service.session() as session, session.begin():
        dek = _dek(await _profile(session, owner_id, create=True))
        for (content, category), vector in zip(add, vectors[: len(add)], strict=True):
            memory_id = uuid.uuid4()
            await session.execute(
                insert(memories).values(
                    id=memory_id,
                    owner_id=owner_id,
                    content_enc=cipher.encrypt(dek, content, memory_aad(memory_id)),
                    category=category,
                    embedding=vector,
                    source_chat_id=source_chat_id,
                    created_at=now,
                    updated_at=now,
                )
            )
        for (memory_id, content, category), vector in zip(
            update_, vectors[len(add) :], strict=True
        ):
            await session.execute(
                update(memories)
                .where(memories.c.id == memory_id, memories.c.owner_id == owner_id)
                .values(
                    content_enc=cipher.encrypt(dek, content, memory_aad(memory_id)),
                    category=category,
                    embedding=vector,
                    updated_at=now,
                )
            )
        if remove:
            await session.execute(
                delete(memories).where(memories.c.owner_id == owner_id, memories.c.id.in_(remove))
            )


async def delete_memory(owner_id: UUID, memory_id: UUID) -> bool:
    async with db_service.session() as session, session.begin():
        result = await session.execute(
            delete(memories).where(memories.c.owner_id == owner_id, memories.c.id == memory_id)
        )
        return result.rowcount > 0


async def clear_memories(owner_id: UUID) -> int:
    async with db_service.session() as session, session.begin():
        result = await session.execute(delete(memories).where(memories.c.owner_id == owner_id))
        return result.rowcount


async def move_memories(session, from_owner: UUID, to_owner: UUID) -> int:
    """Re-encrypt one owner's memories under another owner's key (account claim).
    Runs inside the caller's transaction."""
    old = await _profile(session, from_owner, create=False)
    if old is None:
        return 0
    new = await _profile(session, to_owner, create=True)
    cipher = get_chat_cipher()
    old_dek, new_dek = _dek(old), _dek(new)
    rows = (
        await session.execute(select(memories).where(memories.c.owner_id == from_owner))
    ).all()
    for row in rows:
        content = cipher.decrypt(old_dek, row.content_enc, memory_aad(row.id))
        await session.execute(
            update(memories)
            .where(memories.c.id == row.id)
            .values(
                owner_id=to_owner,
                content_enc=cipher.encrypt(new_dek, content, memory_aad(row.id)),
            )
        )
    await session.execute(delete(memory_profiles).where(memory_profiles.c.owner_id == from_owner))
    return len(rows)
