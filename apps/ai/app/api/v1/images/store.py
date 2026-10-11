"""Encrypted storage for generated images (Postgres bytea)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.core.crypto import get_chat_cipher, image_aad, image_prompt_aad
from app.core.db.session import db_service
from app.core.db.tables import generated_images


@dataclass(frozen=True)
class StoredImage:
    id: UUID
    mime_type: str
    width: int
    height: int
    data: bytes


async def save_image(
    *,
    owner_id: UUID,
    chat_id: UUID | None,
    message_id: UUID | None,
    model: str,
    prompt: str,
    mime_type: str,
    width: int,
    height: int,
    seed: int | None,
    data: bytes,
) -> UUID:
    cipher = get_chat_cipher()
    image_id = uuid.uuid4()
    dek, wrapped, key_id = cipher.new_data_key(image_id)
    async with db_service.session() as session, session.begin():
        await session.execute(
            insert(generated_images).values(
                id=image_id,
                owner_id=owner_id,
                chat_id=chat_id,
                message_id=message_id,
                model=model,
                prompt_enc=cipher.encrypt(dek, prompt, image_prompt_aad(image_id)),
                mime_type=mime_type,
                width=width,
                height=height,
                seed=seed,
                data_enc=cipher.encrypt_bytes(dek, data, image_aad(image_id)),
                dek_wrapped=wrapped,
                dek_key_id=key_id,
                created_at=datetime.now(UTC),
            )
        )
    return image_id


async def load_image(owner_id: UUID, image_id: UUID) -> StoredImage | None:
    async with db_service.session() as session:
        row = (
            await session.execute(
                select(generated_images).where(
                    generated_images.c.id == image_id, generated_images.c.owner_id == owner_id
                )
            )
        ).one_or_none()
    if row is None:
        return None
    cipher = get_chat_cipher()
    dek = cipher.unwrap_data_key(row.id, row.dek_wrapped, row.dek_key_id)
    return StoredImage(
        id=row.id,
        mime_type=row.mime_type,
        width=row.width,
        height=row.height,
        data=cipher.decrypt_bytes(dek, row.data_enc, image_aad(row.id)),
    )
