"""Text chunking shared by web RAG and document ingestion."""

from __future__ import annotations

import re

CHUNK_CHARS = 1200
CHUNK_OVERLAP = 200


def chunk_text(text: str, *, max_chunks: int | None = None) -> list[str]:
    """Split text into ~CHUNK_CHARS pieces with overlap, preferring paragraph
    or sentence boundaries."""
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    chunks: list[str] = []
    start = 0
    while start < len(text) and (max_chunks is None or len(chunks) < max_chunks):
        end = min(start + CHUNK_CHARS, len(text))
        if end < len(text):
            cut = max(text.rfind("\n", start, end), text.rfind(". ", start, end))
            if cut > start + CHUNK_CHARS // 2:
                end = cut + 1
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - CHUNK_OVERLAP, start + 1)
    return [c for c in chunks if c]
