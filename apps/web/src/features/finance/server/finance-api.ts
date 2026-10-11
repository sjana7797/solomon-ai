import "server-only";

import type {
  FinanceNewsItem,
  HistoryRange,
  Market,
  MarketOverview,
  PricePoint,
  Quote,
  SearchResult,
  StockDetails,
} from "../types";

// NestJS apps/api (finance module).
const FINANCE_API_URL = (process.env.FINANCE_API_URL ?? "http://127.0.0.1:3003/api").replace(
  /\/$/,
  "",
);

export class FinanceApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${FINANCE_API_URL}/finance${path}${query ? `?${query}` : ""}`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new FinanceApiError(`Finance API responded with ${res.status}`, res.status);
  return (await res.json()) as T;
}

export const financeApi = {
  overview: (market: Market) => get<MarketOverview>("/overview", { market }),
  quotes: (symbols: string[]) => get<Quote[]>("/quotes", { symbols: symbols.join(",") }),
  stock: (symbol: string) => get<StockDetails>(`/stocks/${encodeURIComponent(symbol)}`),
  history: (symbol: string, range: HistoryRange) =>
    get<PricePoint[]>(`/stocks/${encodeURIComponent(symbol)}/history`, { range }),
  search: (q: string) => get<{ results: SearchResult[]; news: FinanceNewsItem[] }>("/search", { q }),
};
