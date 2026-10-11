import type {
  HistoryRange,
  Market,
  NewsItem,
  PricePoint,
  Quote,
  SearchResult,
  StockDetails,
} from "../finance.types.js";

/** DI token: swap the implementation (e.g. a licensed data API) in FinanceModule. */
export const MARKET_DATA_PROVIDER = Symbol("MARKET_DATA_PROVIDER");

export interface MarketDataProvider {
  quotes(symbols: string[]): Promise<Quote[]>;
  details(symbol: string): Promise<StockDetails | null>;
  history(symbol: string, range: HistoryRange): Promise<PricePoint[]>;
  search(query: string): Promise<{ results: SearchResult[]; news: NewsItem[] }>;
  movers(
    market: Market,
    count: number,
  ): Promise<{ gainers: Quote[]; losers: Quote[] }>;
}
