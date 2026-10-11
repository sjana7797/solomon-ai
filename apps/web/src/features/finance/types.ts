// Mirrors apps/api src/modules/finance/finance.types.ts.

export type Market = "IN" | "US";
export const HISTORY_RANGES = ["1d", "5d", "1mo", "6mo", "1y", "5y"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

export interface Quote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string | null;
  exchange: string | null;
  marketState: string | null;
  time: number | null;
}

export interface StockStats {
  open: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  previousClose: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  volume: number | null;
  averageVolume: number | null;
}

export interface StockDetails {
  quote: Quote;
  stats: StockStats;
  profile: {
    sector: string | null;
    industry: string | null;
    website: string | null;
    summary: string | null;
  };
}

/** Quote + key stats, as attached to chat answers by the AI service. */
export type QuoteSnapshot = Quote & { stats: StockStats };

export interface PricePoint {
  time: number;
  close: number;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
}

export interface FinanceNewsItem {
  title: string;
  url: string;
  publisher: string | null;
  publishedAt: number | null;
}

export interface MarketOverview {
  market: Market;
  indices: Quote[];
  gainers: Quote[];
  losers: Quote[];
}
