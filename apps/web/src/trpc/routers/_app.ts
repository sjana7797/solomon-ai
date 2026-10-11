import { discoverRouter } from "@/features/discover/server/router";
import { financeRouter } from "@/features/finance/server/router";
import { systemRouter } from "@/features/system/server/router";
import { vaultRouter } from "@/features/vault/server/router";
import { createTRPCRouter } from "@/trpc/init";

// App APIs only. AI calls go straight to the AI service over REST/SSE
// (see features/chat/api) and never through tRPC.
export const appRouter = createTRPCRouter({
  system: systemRouter,
  discover: discoverRouter,
  finance: financeRouter,
  vault: vaultRouter,
});

export type AppRouter = typeof appRouter;
