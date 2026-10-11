import { customType, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/*
 * Images generated locally (Ollama image models, e.g. FLUX.2 Klein).
 * Bytes and prompt are AES-256-GCM encrypted with a per-image data key, like
 * chats; served by the AI service only to `owner_id`.
 */
export const generatedImages = pgTable(
  "generated_images",
  {
    id: uuid().primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    /** Chat + assistant message that produced it (client-generated ids). */
    chatId: uuid("chat_id"),
    messageId: uuid("message_id"),
    model: text().notNull(),
    promptEnc: text("prompt_enc").notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    seed: integer(),
    dataEnc: bytea("data_enc").notNull(),
    dekWrapped: text("dek_wrapped").notNull(),
    dekKeyId: text("dek_key_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("generated_images_owner_idx").on(t.ownerId, t.createdAt)],
);
