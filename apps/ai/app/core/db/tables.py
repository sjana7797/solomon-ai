"""
SQLAlchemy Core mirrors of the tables owned by packages/database (Drizzle).
Drizzle owns the schema and migrations; keep these in sync with
packages/database/src/schema/chat.ts.
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, MetaData, Table, Text, false
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import BYTEA, ENUM, TSVECTOR, UUID

metadata = MetaData()

message_role = ENUM("system", "user", "assistant", name="message_role", create_type=False)
message_status = ENUM("done", "stopped", "error", name="message_status", create_type=False)

chats = Table(
    "chats",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("owner_id", UUID(as_uuid=True), nullable=False),
    Column("title_enc", Text, nullable=False),
    Column("model", Text, nullable=False),
    Column("dek_wrapped", Text, nullable=False),
    Column("dek_key_id", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    Column("deleted_at", DateTime(timezone=True)),
)

messages = Table(
    "messages",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("chat_id", UUID(as_uuid=True), ForeignKey("chats.id", ondelete="CASCADE"), nullable=False),
    Column("role", message_role, nullable=False),
    Column("status", message_status, nullable=False),
    Column("content_enc", Text, nullable=False),
    Column("reasoning_enc", Text),
    Column("thinking", Boolean, nullable=False, server_default=false()),
    Column("reasoning_ms", Integer),
    Column("web_search", Boolean, nullable=False, server_default=false()),
    Column("sources_enc", Text),
    Column("images_enc", Text),
    Column("model", Text),
    Column("error", Text),
    Column("prompt_tokens", Integer),
    Column("completion_tokens", Integer),
    Column("latency_ms", Integer),
    Column("created_at", DateTime(timezone=True), nullable=False),
)


EMBEDDING_DIMENSIONS = 768  # mnemosyne (embeddinggemma)

document_kind = ENUM("web", "upload", name="document_kind", create_type=False)
document_status = ENUM("processing", "ready", "failed", name="document_status", create_type=False)

documents = Table(
    "documents",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("kind", document_kind, nullable=False),
    Column("owner_id", UUID(as_uuid=True)),
    Column("url", Text),
    Column("title_enc", Text, nullable=False),
    Column("mime_type", Text),
    Column("size_bytes", Integer),
    Column("status", document_status, nullable=False),
    Column("error", Text),
    Column("chunk_count", Integer, nullable=False),
    Column("dek_wrapped", Text, nullable=False),
    Column("dek_key_id", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", DateTime(timezone=True)),
)

chunks = Table(
    "chunks",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("document_id", UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
    Column("ordinal", Integer, nullable=False),
    Column("content_enc", Text, nullable=False),
    Column("embedding", Vector(EMBEDDING_DIMENSIONS), nullable=False),
    Column("tsv", TSVECTOR, nullable=False),
)


generated_images = Table(
    "generated_images",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("owner_id", UUID(as_uuid=True), nullable=False),
    Column("chat_id", UUID(as_uuid=True)),
    Column("message_id", UUID(as_uuid=True)),
    Column("model", Text, nullable=False),
    Column("prompt_enc", Text, nullable=False),
    Column("mime_type", Text, nullable=False),
    Column("width", Integer, nullable=False),
    Column("height", Integer, nullable=False),
    Column("seed", Integer),
    Column("data_enc", BYTEA, nullable=False),
    Column("dek_wrapped", Text, nullable=False),
    Column("dek_key_id", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
