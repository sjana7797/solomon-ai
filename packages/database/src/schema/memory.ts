import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { chats } from "./chat";
import { EMBEDDING_DIMENSIONS } from "./document";

/*
 * Assistant memory, encrypted like chats (apps/ai/app/core/crypto.py).
 *
 * Long-term: `memories` holds durable facts about a user (name, preferences,
 * projects) extracted from their messages, searchable by `embedding`. Each
 * owner has one data key in `memory_profiles`, which also stores whether
 * memory is on. `embedding` stays plaintext for search — treat it as sensitive.
 *
 * Short-term: `chat_summaries` keeps a rolling summary of a chat's older
 * messages (encrypted with the chat's own key), so long chats send the
 * summary plus recent messages instead of the full history.
 */

export const memoryProfiles = pgTable("memory_profiles", {
  ownerId: uuid("owner_id").primaryKey(),
  enabled: boolean().notNull().default(true),
  dekWrapped: text("dek_wrapped").notNull(),
  dekKeyId: text("dek_key_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memories = pgTable(
  "memories",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => memoryProfiles.ownerId, { onDelete: "cascade" }),
    contentEnc: text("content_enc").notNull(),
    /** identity | preference | interest | project | other */
    category: text().notNull().default("other"),
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    /** Chat the fact was learned in (kept if the chat is deleted). */
    sourceChatId: uuid("source_chat_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("memories_owner_idx").on(t.ownerId, t.updatedAt),
    index("memories_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const chatSummaries = pgTable("chat_summaries", {
  chatId: uuid("chat_id")
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  summaryEnc: text("summary_enc").notNull(),
  /** How many of the chat's oldest messages the summary covers. */
  coveredMessages: integer("covered_messages").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
