import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { baseProcedure, createTRPCRouter } from "@/trpc/init";

import { HISTORY_RANGES } from "../types";
import { FinanceApiError, financeApi } from "./finance-api";

const symbol = z.string().trim().min(1).max(32);

async function call<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof FinanceApiError && error.status === 404) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Unknown symbol" });
    }
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Market data is unavailable", cause: error });
  }
}

export const financeRouter = createTRPCRouter({
  overview: baseProcedure
    .input(z.object({ market: z.enum(["IN", "US"]) }))
    .query(({ input }) => call(financeApi.overview(input.market))),
  quotes: baseProcedure
    .input(z.object({ symbols: z.array(symbol).max(50) }))
    .query(({ input }) =>
      input.symbols.length ? call(financeApi.quotes(input.symbols)) : Promise.resolve([]),
    ),
  stock: baseProcedure
    .input(z.object({ symbol }))
    .query(({ input }) => call(financeApi.stock(input.symbol))),
  history: baseProcedure
    .input(z.object({ symbol, range: z.enum(HISTORY_RANGES) }))
    .query(({ input }) => call(financeApi.history(input.symbol, input.range))),
  search: baseProcedure
    .input(z.object({ q: z.string().trim().max(100) }))
    .query(({ input }) =>
      input.q ? call(financeApi.search(input.q)) : Promise.resolve({ results: [], news: [] }),
    ),
});
