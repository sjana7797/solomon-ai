"""
Re-embed every stored chunk with the current EMBEDDING_MODEL.

Run after changing what the embedding model points to (e.g. repointing the
LiteLLM `mnemosyne` alias): vectors from different models aren't comparable,
so stale ones silently degrade search.

    uv run python -m scripts.reembed            # everything
    uv run python -m scripts.reembed --web-only # just the web-page cache
"""

from __future__ import annotations

import argparse
import asyncio

import main  # noqa: F401  (load the app so modules import in the right order)
from sqlalchemy import select, update

from app.core.crypto import chunk_aad, get_chat_cipher
from app.core.db.session import db_service
from app.core.db.tables import chunks, documents
from app.core.llm import embed

BATCH = 64


async def run(web_only: bool) -> None:
    await db_service.connect()
    cipher = get_chat_cipher()
    query = select(documents.c.id, documents.c.dek_wrapped, documents.c.dek_key_id)
    if web_only:
        query = query.where(documents.c.kind == "web")
    total = 0
    async with db_service.session() as session:
        docs = (await session.execute(query)).all()
    for doc in docs:
        dek = cipher.unwrap_data_key(doc.id, doc.dek_wrapped, doc.dek_key_id)
        async with db_service.session() as session, session.begin():
            rows = (
                await session.execute(
                    select(chunks.c.id, chunks.c.content_enc).where(chunks.c.document_id == doc.id)
                )
            ).all()
            texts = [cipher.decrypt(dek, r.content_enc, chunk_aad(r.id)) for r in rows]
            for start in range(0, len(rows), BATCH):
                vectors = await embed(texts[start : start + BATCH])
                for row, vector in zip(rows[start : start + BATCH], vectors, strict=True):
                    await session.execute(
                        update(chunks).where(chunks.c.id == row.id).values(embedding=vector)
                    )
        total += len(rows)
        print(f"re-embedded {len(rows):4} chunks  document {doc.id}")
    print(f"done: {len(docs)} documents, {total} chunks")
    await db_service.disconnect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-only", action="store_true")
    asyncio.run(run(parser.parse_args().web_only))
