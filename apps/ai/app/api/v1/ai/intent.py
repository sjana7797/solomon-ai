"""Intent detection with the `laya` decision model (~65 ms)."""

from __future__ import annotations

import logging

from app.core.decisions import decide

logger = logging.getLogger(__name__)

# Tuned on a labelled set: 94% accuracy, no false positives (misses some
# indirect asks like "design a poster" — the Image toggle covers those).
_IMAGE_THRESHOLD = 0.5


async def wants_image(message: str) -> bool:
    """Is the user asking for a new image to be generated?"""
    try:
        answers = await decide(
            message[:1500],
            {
                "image": {
                    "type": "noul",
                    "instructions": "Is the user asking the assistant to create, draw, generate, design or render a new picture, illustration, logo, photo or artwork?",
                }
            },
        )
        return answers["image"]["noul"] > _IMAGE_THRESHOLD
    except Exception as exc:
        logger.warning("Intent detection unavailable (%s)", exc)
        return False
