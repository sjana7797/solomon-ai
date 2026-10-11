import { db, eq, userKeys } from "@solomon-ai/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const base64 = z.string().min(16).max(512).regex(/^[A-Za-z0-9+/=]+$/);
const kdf = z.object({
  name: z.literal("PBKDF2"),
  hash: z.literal("SHA-256"),
  iterations: z.number().int().min(100_000).max(10_000_000),
});
const passphraseKeys = z.object({ passphraseWrapped: base64, passphraseSalt: base64, passphraseKdf: kdf });

/** Wrapped account keys. The server never sees the passphrase, recovery key or account key. */
export const vaultRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db.select().from(userKeys).where(eq(userKeys.userId, ctx.user.id));
    if (!row) return null;
    return {
      passphraseWrapped: row.passphraseWrapped,
      passphraseSalt: row.passphraseSalt,
      passphraseKdf: kdf.parse(row.passphraseKdf),
      recoveryWrapped: row.recoveryWrapped,
      recoverySalt: row.recoverySalt,
    };
  }),

  create: protectedProcedure
    .input(passphraseKeys.extend({ recoveryWrapped: base64, recoverySalt: base64 }))
    .mutation(async ({ ctx, input }) => {
      const created = await db
        .insert(userKeys)
        .values({ userId: ctx.user.id, ...input })
        .onConflictDoNothing()
        .returning({ userId: userKeys.userId });
      if (!created.length) {
        throw new TRPCError({ code: "CONFLICT", message: "Encryption is already set up for this account." });
      }
    }),

  /** New passphrase wrapping (after unlocking with the old one or the recovery key). */
  setPassphrase: protectedProcedure.input(passphraseKeys).mutation(async ({ ctx, input }) => {
    const updated = await db
      .update(userKeys)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(userKeys.userId, ctx.user.id))
      .returning({ userId: userKeys.userId });
    if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "Encryption isn't set up yet." });
  }),
});
