"""
Short-term memory: long chats send a rolling summary of older messages plus
the most recent MEMORY_RECENT_MESSAGES verbatim, instead of the whole history.

The summary is refreshed in the background, MEMORY_SUMMARY_BATCH messages at
a time, so it never delays a reply; until it catches up, the uncovered older
messages are simply sent as they are.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.api.settings import settings
from app.api.v1.ai.schemas import ChatMessage
from app.core.background import spawn_background
from app.core.crypto import get_chat_cipher, summary_aad
from app.core.db.session import db_service
from app.core.db.tables import chat_summaries, chats
from app.core.llm import get_chat_model

logger = logging.getLogger(__name__)

_SUMMARY_PROMPT = """Update the running summary of a conversation between a user and an AI assistant.
Keep what later turns may need: the user's goals and questions, decisions made,
key facts, numbers, names, code or files mentioned, and open threads. Be concise
(at most ~250 words), written as notes. Reply with only the updated summary."""

# Chats being summarised right now, so concurrent turns don't duplicate work.
_in_progress: set[UUID] = set()


async def _load(chat_id: UUID) -> tuple[str, int] | None:
    async with db_service.session() as session:
        row = (
            await session.execute(
                select(
                    chat_summaries.c.summary_enc,
                    chat_summaries.c.covered_messages,
                    chats.c.dek_wrapped,
                    chats.c.dek_key_id,
                )
                .join(chats, chats.c.id == chat_summaries.c.chat_id)
                .where(chat_summaries.c.chat_id == chat_id)
            )
        ).one_or_none()
    if row is None:
        return None
    cipher = get_chat_cipher()
    dek = cipher.unwrap_data_key(chat_id, row.dek_wrapped, row.dek_key_id)
    return cipher.decrypt(dek, row.summary_enc, summary_aad(chat_id)), row.covered_messages


async def _summarise(
    chat_id: UUID, previous: str | None, messages: list[ChatMessage], covered: int, upto: int
) -> None:
    transcript = "\n\n".join(f"{m.role}: {m.content[:2000]}" for m in messages[covered:upto])
    response = await get_chat_model(settings.MEMORY_MODEL, temperature=0).ainvoke(
        [
            SystemMessage(_SUMMARY_PROMPT),
            HumanMessage(
                f"Current summary:\n{previous or '(empty)'}\n\nNew messages:\n{transcript}"
            ),
        ]
    )
    summary = str(response.text).strip()
    if not summary:
        return
    async with db_service.session() as session, session.begin():
        row = (
            await session.execute(
                select(chats.c.dek_wrapped, chats.c.dek_key_id).where(chats.c.id == chat_id)
            )
        ).one_or_none()
        if row is None:  # chat not saved yet (or deleted)
            return
        cipher = get_chat_cipher()
        dek = cipher.unwrap_data_key(chat_id, row.dek_wrapped, row.dek_key_id)
        values = {
            "summary_enc": cipher.encrypt(dek, summary, summary_aad(chat_id)),
            "covered_messages": upto,
            "updated_at": datetime.now(UTC),
        }
        await session.execute(
            insert(chat_summaries)
            .values(chat_id=chat_id, **values)
            .on_conflict_do_update(
                index_elements=[chat_summaries.c.chat_id],
                set_=values,
                # Never move backwards if an older refresh finishes late.
                where=chat_summaries.c.covered_messages < upto,
            )
        )
    logger.info("Chat %s summary now covers %d messages", chat_id, upto)


async def _refresh(chat_id: UUID, messages: list[ChatMessage], current: tuple[str, int] | None):
    try:
        previous, covered = current or (None, 0)
        await _summarise(
            chat_id, previous, messages, covered, len(messages) - settings.MEMORY_RECENT_MESSAGES
        )
    finally:
        _in_progress.discard(chat_id)


async def compact_history(chat_id: UUID, messages: list[ChatMessage]) -> list[dict]:
    """History to send the model: [summary system message] + uncovered messages."""
    as_dicts = [m.model_dump() for m in messages]
    if len(messages) <= settings.MEMORY_RECENT_MESSAGES:
        return as_dicts
    try:
        current = await _load(chat_id)
    except Exception as exc:
        logger.warning("Couldn't load chat summary: %s", exc)
        return as_dicts

    covered = current[1] if current else 0
    # Fold older messages into the summary once a full batch has built up.
    behind = len(messages) - settings.MEMORY_RECENT_MESSAGES - covered
    if behind >= settings.MEMORY_SUMMARY_BATCH and chat_id not in _in_progress:
        _in_progress.add(chat_id)
        spawn_background(_refresh(chat_id, messages, current))

    if current is None or covered > len(messages):  # e.g. messages deleted client-side
        return as_dicts
    summary, covered = current
    return [
        {
            "role": "system",
            "content": "Summary of the earlier part of this conversation:\n" + summary,
        },
        *as_dicts[covered:],
    ]
