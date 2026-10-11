import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

/*
 * End-to-end encryption: each user's account key is created in their browser
 * and only ever stored here wrapped (AES-256-GCM) by keys the server can't
 * derive:
 * - `passphrase_wrapped`: by a key derived from the user's passphrase (PBKDF2),
 * - `recovery_wrapped`: by a key derived from the one-time recovery key (HKDF).
 * Losing both means synced chats can't be decrypted. See
 * apps/web/src/features/vault/lib/crypto.ts.
 */
export const userKeys = pgTable("user_keys", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Scheme version, for future migrations of the wrapping format. */
  version: integer().notNull().default(1),
  passphraseWrapped: text("passphrase_wrapped").notNull(),
  passphraseSalt: text("passphrase_salt").notNull(),
  /** KDF settings, e.g. { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000 }. */
  passphraseKdf: jsonb("passphrase_kdf").notNull(),
  recoveryWrapped: text("recovery_wrapped").notNull(),
  recoverySalt: text("recovery_salt").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
