"""
Long-term memory: recall facts about the user for each turn, and learn new
ones from the user's messages.

Learning runs alongside the answer. A cheap first-person check skips most
messages; the rest go to MEMORY_MODEL together with related existing memories,
which returns add/update/delete operations (so "I moved to Pune" updates the
old city instead of adding a contradiction, and "forget …" deletes).
"""

from __future__ import annotations

import json
import logging
import re
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage

from app.api.settings import settings
from app.api.v1.ai.schemas import ChatMessage
from app.api.v1.memory.store import (
    CATEGORIES,
    Memory,
    MemoryChange,
    apply_changes,
    count_memories,
    list_memories,
    search_memories,
)
from app.core.llm import embed, get_chat_model

logger = logging.getLogger(__name__)

# Messages that could carry a personal fact: first person, or memory commands.
# laya couldn't separate these reliably (stated preferences scored < 0.2).
_PERSONAL = re.compile(
    r"\b(i|i'm|im|i've|i'd|i'll|me|my|mine|myself|we|our|us|call me|as an?|remember|forget|don't remember)\b",
    re.IGNORECASE,
)
_RELATED_K = 12
_MIN_RECALL_SIMILARITY = 0.35

_EXTRACT_PROMPT = """You maintain the assistant's long-term memory about the user.
From the user's latest message, find lasting facts worth remembering for future
conversations: identity (name, job, location, family), preferences (how they like
answers, tools, diet), interests, and ongoing projects or goals.

Rules:
- Only facts the user states about themselves. Ignore one-off requests, questions,
  facts about the world, and anything only true for this conversation.
- Write each memory as a short third-person sentence, e.g. "User is a software engineer in Bangalore."
- Don't add what an existing memory already says. If the message changes an
  existing memory, update it. If the user asks to forget something, delete it.
- Never store passwords, card numbers, government IDs or similar secrets.
- Most messages contain nothing worth remembering: then return empty lists.

Existing memories:
{existing}

Reply with only JSON:
{{"add": [{{"content": "...", "category": "identity|preference|interest|project|other"}}],
 "update": [{{"id": "m1", "content": "...", "category": "..."}}],
 "delete": ["m2"]}}"""


def might_be_personal(message: str) -> bool:
    return bool(_PERSONAL.search(message))


async def recall(owner_id: UUID, query: str) -> list[Memory]:
    """Memories to put in the prompt: all of them while there are few, else the most relevant."""
    if await count_memories(owner_id) <= settings.MEMORY_RECALL_ALL_UNDER:
        return await list_memories(owner_id)
    [vector] = await embed([query[:2000]])
    hits = await search_memories(owner_id, vector, settings.MEMORY_RECALL_K)
    return [memory for memory, similarity in hits if similarity >= _MIN_RECALL_SIMILARITY]


def memory_prompt(items: list[Memory]) -> str:
    facts = "\n".join(f"- {m.content}" for m in items)
    return (
        "What you remember about the user from earlier conversations. Use it when it's "
        "relevant to personalise the answer; don't list it back or mention having memory "
        "unless the user asks what you remember.\n" + facts
    )


def _parse(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return {}
    data = json.loads(text[start : end + 1])
    return data if isinstance(data, dict) else {}


async def learn(
    owner_id: UUID, messages: list[ChatMessage], chat_id: UUID | None
) -> list[MemoryChange]:
    """Extract and store memories from the latest user message; returns what changed."""
    latest = messages[-1].content
    if not might_be_personal(latest):
        return []
    [vector] = await embed([latest[:2000]])
    related = [m for m, _ in await search_memories(owner_id, vector, _RELATED_K)]
    by_key = {f"m{i + 1}": m for i, m in enumerate(related)}
    existing = "\n".join(f"{key}: {m.content}" for key, m in by_key.items()) or "(none)"
    # The previous assistant turn gives context for short replies ("yes, that's me").
    previous = next(
        (m.content[:600] for m in reversed(messages[:-1]) if m.role == "assistant"), None
    )
    user_text = (f"Assistant said: {previous}\n\n" if previous else "") + f"User: {latest[:3000]}"

    response = await get_chat_model(settings.MEMORY_MODEL, temperature=0).ainvoke(
        [SystemMessage(_EXTRACT_PROMPT.format(existing=existing)), HumanMessage(user_text)]
    )
    data = _parse(str(response.text))

    def category(value: object) -> str:
        return value if isinstance(value, str) and value in CATEGORIES else "other"

    add = [
        (str(item["content"]).strip(), category(item.get("category")))
        for item in data.get("add") or []
        if isinstance(item, dict) and str(item.get("content") or "").strip()
    ]
    updates = [
        (by_key[item["id"]], str(item["content"]).strip(), category(item.get("category")))
        for item in data.get("update") or []
        if isinstance(item, dict)
        and item.get("id") in by_key
        and str(item.get("content") or "").strip()
    ]
    removed = [by_key[key] for key in data.get("delete") or [] if key in by_key]
    if not (add or updates or removed):
        return []

    await apply_changes(
        owner_id,
        add=add,
        update_=[(memory.id, content, cat) for memory, content, cat in updates],
        remove=[memory.id for memory in removed],
        source_chat_id=chat_id,
    )
    return [
        *(MemoryChange("add", content) for content, _ in add),
        *(MemoryChange("update", content) for _, content, _ in updates),
        *(MemoryChange("delete", memory.content) for memory in removed),
    ]
