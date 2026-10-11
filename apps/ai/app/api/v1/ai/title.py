import asyncio
import logging
import re

from langchain_core.messages import HumanMessage, SystemMessage

from app.api.settings import settings
from app.core.llm import get_chat_model

logger = logging.getLogger(__name__)

TITLE_MAX_CHARS = 60
TITLE_TIMEOUT_SECONDS = 20
_QUERY_MAX_CHARS = 2000

_SYSTEM_PROMPT = (
    "You write short titles for chat conversations based on the user's first message. "
    "Reply with only the title: 2 to 6 words, Title Case, no quotes, no emoji, "
    "no trailing punctuation, in the same language as the message."
)


def _clean_title(raw: str) -> str | None:
    line = next((line for line in raw.splitlines() if line.strip()), "")
    line = re.sub(r"^\s*(title\s*:)\s*", "", line, flags=re.IGNORECASE)
    line = line.strip().strip("\"'`*#").strip().rstrip(".!?:;,")
    if not line:
        return None
    if len(line) > TITLE_MAX_CHARS:
        line = line[:TITLE_MAX_CHARS].rsplit(" ", 1)[0].rstrip(" ,;:-") + "…"
    return line


async def generate_title(query: str, model: str) -> str | None:
    """Generate a short chat title for the user's first message.

    Returns None on failure or timeout so callers can fall back to their own title.
    """
    llm = get_chat_model(settings.TITLE_MODEL or model, temperature=0.3)
    try:
        response = await asyncio.wait_for(
            llm.ainvoke(
                [
                    SystemMessage(_SYSTEM_PROMPT),
                    HumanMessage(query[:_QUERY_MAX_CHARS]),
                ]
            ),
            timeout=TITLE_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.warning("Title generation failed: %s", exc)
        return None
    return _clean_title(str(response.text))
