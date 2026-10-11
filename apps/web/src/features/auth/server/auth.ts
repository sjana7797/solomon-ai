import "server-only";


import { account, db, jwks, session, user, verification } from "@solomon-ai/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";

/*
 * Accounts (Better Auth). Sessions are cookies on this app; other services
 * (AI service, Nest API, PowerSync) get short-lived JWTs from /api/auth/token
 * and verify them against /api/auth/jwks.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, jwks },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  advanced: {
    // UUIDs, so user ids fit the existing uuid `owner_id` columns.
    database: { generateId: "uuid" },
  },
  plugins: [
    jwt({
      jwks: { keyPairConfig: { alg: "EdDSA", crv: "Ed25519" } },
      jwt: {
        issuer: process.env.BETTER_AUTH_URL,
        audience: ["solomon", "powersync"],
        // PowerSync requires tokens that expire within 60 minutes.
        expirationTime: "15m",
      },
    }),
    nextCookies(),
  ],
});
