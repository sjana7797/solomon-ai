"""
pgvector-backed RAG store: ingest documents (web pages and uploads) as
encrypted chunks with embeddings, and run hybrid search over them.

Chunk text is encrypted per document; `embedding` and `tsv` stay plaintext so
Postgres can search them.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import bindparam, delete, func, select, text, update
from sqlalchemy.dialects.postgresql import insert

from app.core.chunking import chunk_text
from app.core.crypto import ChatCipher, chunk_aad, document_title_aad, get_chat_cipher
from app.core.db.session import db_service
from app.core.db.tables import chunks, documents
from app.core.llm import embed

logger = logging.getLogger(__name__)

WEB_CACHE_TTL = timedelta(hours=24)
MAX_CHUNKS_PER_DOCUMENT = 2000
# Web pages can be huge (scraped docs, changelogs); the top of the page is
# what search hits on, and embedding it all would hog the local GPU.
MAX_WEB_PAGE_CHUNKS = 60
_EMBED_BATCH = 64
# Reciprocal rank fusion constant (standard value).
_RRF_K = 60


@dataclass(frozen=True)
class SearchHit:
    document_id: UUID
    text: str
    similarity: float


@dataclass(frozen=True)
class DocumentInfo:
    id: UUID
    title: str
    mime_type: str | None
    size_bytes: int | None
    status: str
    error: str | None
    chunk_count: int
    created_at: datetime


def _vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in vector) + "]"


async def _insert_chunks(
    session, cipher: ChatCipher, dek: bytes, document_id: UUID, texts: list[str], vectors
) -> None:
    rows = []
    for ordinal, (content, vector) in enumerate(zip(texts, vectors, strict=True)):
        chunk_id = uuid.uuid4()
        rows.append(
            {
                "id": chunk_id,
                "document_id": document_id,
                "ordinal": ordinal,
                "content_enc": cipher.encrypt(dek, content, chunk_aad(chunk_id)),
                "embedding": vector,
                "tsv": func.to_tsvector("english", content),
            }
        )
    # Multi-row VALUES (not executemany) so each row can call to_tsvector().
    for start in range(0, len(rows), 200):
        await session.execute(insert(chunks).values(rows[start : start + 200]))


async def _embed_all(texts: list[str]) -> list[list[float]]:
    vectors: list[list[float]] = []
    for start in range(0, len(texts), _EMBED_BATCH):
        vectors.extend(await embed(texts[start : start + _EMBED_BATCH]))
    return vectors


# ---------------------------------------------------------------- web cache


async def cached_web_documents(urls: list[str]) -> dict[str, UUID]:
    """URL -> document id for web pages already embedded and not expired."""
    if not urls:
        return {}
    async with db_service.session() as session:
        rows = await session.execute(
            select(documents.c.url, documents.c.id).where(
                documents.c.kind == "web",
                documents.c.status == "ready",
                documents.c.url.in_(urls),
                documents.c.expires_at > datetime.now(UTC),
            )
        )
        return {row.url: row.id for row in rows}


async def ingest_web_page(url: str, title: str, content: str) -> None:
    """Embed a whole web page and cache it for WEB_CACHE_TTL (shared by all users)."""
    texts = chunk_text(content, max_chunks=MAX_WEB_PAGE_CHUNKS)
    if not texts:
        return
    vectors = await _embed_all(texts)
    cipher = get_chat_cipher()
    document_id = uuid.uuid4()
    dek, wrapped, key_id = cipher.new_data_key(document_id)
    now = datetime.now(UTC)
    async with db_service.session() as session, session.begin():
        # Replace an expired copy; a fresh one inserted concurrently wins.
        await session.execute(
            delete(documents).where(
                documents.c.kind == "web",
                documents.c.url == url,
                documents.c.expires_at <= now,
            )
        )
        created = await session.scalar(
            insert(documents)
            .values(
                id=document_id,
                kind="web",
                url=url,
                title_enc=cipher.encrypt(dek, title, document_title_aad(document_id)),
                status="ready",
                chunk_count=len(texts),
                dek_wrapped=wrapped,
                dek_key_id=key_id,
                created_at=now,
                expires_at=now + WEB_CACHE_TTL,
            )
            .on_conflict_do_nothing(index_elements=[documents.c.url], index_where=text("kind = 'web'"))
            .returning(documents.c.id)
        )
        if created is None:
            return
        await _insert_chunks(session, cipher, dek, document_id, texts, vectors)
    logger.info("Cached web page %s (%d chunks)", url, len(texts))


# ------------------------------------------------------------------ uploads


async def create_upload(
    owner_id: UUID, title: str, mime_type: str, size_bytes: int
) -> DocumentInfo:
    cipher = get_chat_cipher()
    document_id = uuid.uuid4()
    dek, wrapped, key_id = cipher.new_data_key(document_id)
    now = datetime.now(UTC)
    async with db_service.session() as session, session.begin():
        await session.execute(
            insert(documents).values(
                id=document_id,
                kind="upload",
                owner_id=owner_id,
                title_enc=cipher.encrypt(dek, title, document_title_aad(document_id)),
                mime_type=mime_type,
                size_bytes=size_bytes,
                status="processing",
                chunk_count=0,
                dek_wrapped=wrapped,
                dek_key_id=key_id,
                created_at=now,
            )
        )
    return DocumentInfo(document_id, title, mime_type, size_bytes, "processing", None, 0, now)


async def ingest_upload(document_id: UUID, content: str) -> None:
    """Chunk, embed and store an upload; marks it ready or failed."""
    try:
        texts = chunk_text(content, max_chunks=MAX_CHUNKS_PER_DOCUMENT)
        if not texts:
            raise ValueError("No readable text found in the file.")
        vectors = await _embed_all(texts)
        cipher = get_chat_cipher()
        async with db_service.session() as session, session.begin():
            row = (
                await session.execute(
                    select(documents.c.dek_wrapped, documents.c.dek_key_id).where(
                        documents.c.id == document_id
                    )
                )
            ).one_or_none()
            if row is None:  # deleted while processing
                return
            dek = cipher.unwrap_data_key(document_id, row.dek_wrapped, row.dek_key_id)
            await _insert_chunks(session, cipher, dek, document_id, texts, vectors)
            await session.execute(
                update(documents)
                .where(documents.c.id == document_id)
                .values(status="ready", chunk_count=len(texts))
            )
        logger.info("Ingested upload %s (%d chunks)", document_id, len(texts))
    except Exception as exc:
        logger.exception("Upload ingestion failed for %s", document_id)
        message = str(exc) if isinstance(exc, ValueError) else "Couldn't process this file."
        async with db_service.session() as session, session.begin():
            await session.execute(
                update(documents)
                .where(documents.c.id == document_id)
                .values(status="failed", error=message)
            )


def _to_info(cipher: ChatCipher, row) -> DocumentInfo:
    dek = cipher.unwrap_data_key(row.id, row.dek_wrapped, row.dek_key_id)
    return DocumentInfo(
        id=row.id,
        title=cipher.decrypt(dek, row.title_enc, document_title_aad(row.id)),
        mime_type=row.mime_type,
        size_bytes=row.size_bytes,
        status=row.status,
        error=row.error,
        chunk_count=row.chunk_count,
        created_at=row.created_at,
    )


async def list_uploads(owner_id: UUID, ids: list[UUID] | None = None) -> list[DocumentInfo]:
    cipher = get_chat_cipher()
    query = select(documents).where(
        documents.c.kind == "upload", documents.c.owner_id == owner_id
    )
    if ids is not None:
        query = query.where(documents.c.id.in_(ids))
    async with db_service.session() as session:
        rows = await session.execute(query.order_by(documents.c.created_at.desc()))
        return [_to_info(cipher, row) for row in rows]


async def delete_upload(owner_id: UUID, document_id: UUID) -> bool:
    async with db_service.session() as session, session.begin():
        result = await session.execute(
            delete(documents).where(
                documents.c.id == document_id,
                documents.c.kind == "upload",
                documents.c.owner_id == owner_id,
            )
        )
        return result.rowcount > 0


# ------------------------------------------------------------------- search

_HYBRID_SQL = text(
    """
    WITH vec AS (
        SELECT id, row_number() OVER (ORDER BY embedding <=> CAST(:q AS vector)) AS r
        FROM chunks
        WHERE document_id = ANY(:ids)
        ORDER BY embedding <=> CAST(:q AS vector)
        LIMIT :pool
    ),
    txt AS (
        SELECT c.id, row_number() OVER (ORDER BY ts_rank_cd(c.tsv, q) DESC) AS r
        FROM chunks c, websearch_to_tsquery('english', :query) q
        WHERE c.document_id = ANY(:ids) AND c.tsv @@ q
        ORDER BY ts_rank_cd(c.tsv, q) DESC
        LIMIT :pool
    )
    SELECT c.id, c.document_id, c.content_enc,
           1 - (c.embedding <=> CAST(:q AS vector)) AS similarity,
           COALESCE(1.0 / (:rrf_k + vec.r), 0) + COALESCE(1.0 / (:rrf_k + txt.r), 0) AS rrf
    FROM chunks c
    LEFT JOIN vec ON vec.id = c.id
    LEFT JOIN txt ON txt.id = c.id
    WHERE vec.id IS NOT NULL OR txt.id IS NOT NULL
    ORDER BY rrf DESC
    LIMIT :k
    """
).bindparams(bindparam("ids", expanding=False))


async def hybrid_search(
    document_ids: list[UUID], query: str, query_vector: list[float], k: int
) -> list[SearchHit]:
    """Vector + full-text search over the given documents, fused with RRF."""
    if not document_ids:
        return []
    cipher = get_chat_cipher()
    async with db_service.session() as session:
        rows = (
            await session.execute(
                _HYBRID_SQL,
                {
                    "ids": document_ids,
                    "q": _vector_literal(query_vector),
                    "query": query,
                    "pool": max(k * 4, 40),
                    "rrf_k": _RRF_K,
                    "k": k,
                },
            )
        ).all()
        keys = (
            await session.execute(
                select(documents.c.id, documents.c.dek_wrapped, documents.c.dek_key_id).where(
                    documents.c.id.in_({row.document_id for row in rows})
                )
            )
        ).all() if rows else []
    deks = {r.id: cipher.unwrap_data_key(r.id, r.dek_wrapped, r.dek_key_id) for r in keys}
    return [
        SearchHit(
            document_id=row.document_id,
            text=cipher.decrypt(deks[row.document_id], row.content_enc, chunk_aad(row.id)),
            similarity=float(row.similarity),
        )
        for row in rows
    ]
