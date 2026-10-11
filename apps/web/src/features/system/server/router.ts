import { baseProcedure, createTRPCRouter } from "@/trpc/init";

export const systemRouter = createTRPCRouter({
  health: baseProcedure.query(() => ({
    status: "ok" as const,
    time: new Date(),
  })),
});
