export type Market = "IN" | "US";
export type HistoryRange = "1d" | "5d" | "1mo" | "6mo" | "1y" | "5y";
export const HISTORY_RANGES: HistoryRange[] = ["1d", "5d", "1mo", "6mo", "1y", "5y"];

export interface Quote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string | null;
  exchange: string | null;
  marketState: string | null;
  /** Unix ms of the quote; data may be delayed by the exchange. */
  time: number | null;
}

export interface PricePoint {
  time: number;
  close: number;
}

export interface StockDetails {
  quote: Quote;
  stats: {
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
  };
  profile: {
    sector: string | null;
    industry: string | null;
    website: string | null;
    summary: string | null;
  };
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
}

export interface NewsItem {
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
