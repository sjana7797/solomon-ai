"""Fire-and-forget tasks that must outlive the request (saves, ingestion)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

logger = logging.getLogger(__name__)

# Strong references so running tasks aren't garbage-collected.
_tasks: set[asyncio.Task[None]] = set()


def spawn_background(coro: Coroutine[Any, Any, None]) -> None:
    async def run() -> None:
        try:
            await coro
        except Exception:
            logger.exception("Background task failed")

    task = asyncio.create_task(run())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
