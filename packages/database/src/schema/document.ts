import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/*
 * RAG store (pgvector). Two kinds of documents share it:
 * - `web`: pages from web search, cached so repeat questions skip re-embedding.
 *   Shared across users (public content), refreshed after `expires_at`.
 * - `upload`: files a user attached (PDF, DOCX, text), owned by `owner_id`.
 *
 * Chunk text is encrypted per document like chat messages (`dek_wrapped`).
 * `embedding` and `tsv` must stay plaintext for search to work — they are
 * derived from the content, so treat them as sensitive.
 */

/** 768 dims = `mnemosyne` (embeddinggemma) via LiteLLM. Changing models means re-embedding. */
export const EMBEDDING_DIMENSIONS = 768;

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

export const documentKind = pgEnum("document_kind", ["web", "upload"]);
export const documentStatus = pgEnum("document_status", ["processing", "ready", "failed"]);

export const documents = pgTable(
  "documents",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: documentKind().notNull(),
    /** Owner for uploads; null for shared web pages. */
    ownerId: uuid("owner_id"),
    /** Page URL for web documents. */
    url: text(),
    titleEnc: text("title_enc").notNull(),
    /** File name / MIME type for uploads. */
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    status: documentStatus().notNull().default("processing"),
    error: text(),
    chunkCount: integer("chunk_count").notNull().default(0),
    dekWrapped: text("dek_wrapped").notNull(),
    dekKeyId: text("dek_key_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Web cache expiry; null for uploads. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("documents_web_url_idx").on(t.url).where(sql`${t.kind} = 'web'`),
    index("documents_owner_idx").on(t.ownerId, t.createdAt),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid().primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    ordinal: integer().notNull(),
    contentEnc: text("content_enc").notNull(),
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    tsv: tsvector().notNull(),
  },
  (t) => [
    index("chunks_document_idx").on(t.documentId, t.ordinal),
    index("chunks_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("chunks_tsv_idx").using("gin", t.tsv),
  ],
);
