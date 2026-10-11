import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type { HistoryRange, Market, MarketOverview } from "./finance.types.js";
import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
} from "./providers/market-data.provider.js";
import { TtlCache } from "./ttl-cache.js";

const INDICES: Record<Market, string[]> = {
  IN: ["^NSEI", "^BSESN", "^NSEBANK", "INR=X"],
  US: ["^GSPC", "^IXIC", "^DJI", "INR=X"],
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;

@Injectable()
export class FinanceService {
  private readonly cache = new TtlCache();

  constructor(
    @Inject(MARKET_DATA_PROVIDER) private readonly provider: MarketDataProvider,
  ) {}

  async overview(market: Market): Promise<MarketOverview> {
    return this.cache.get(`overview:${market}`, 30 * SECOND, async () => {
      const [indices, movers] = await Promise.all([
        this.provider.quotes(INDICES[market]),
        this.provider.movers(market, 5),
      ]);
      return { market, indices, ...movers };
    });
  }

  quotes(symbols: string[]) {
    const unique = [
      ...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
    ].slice(0, 50);
    return this.cache.get(
      `quotes:${unique.sort().join(",")}`,
      15 * SECOND,
      () => this.provider.quotes(unique),
    );
  }

  async stock(symbol: string) {
    const key = symbol.toUpperCase();
    const details = await this.cache.get(`stock:${key}`, 30 * SECOND, () =>
      this.provider.details(key),
    );
    if (!details) throw new NotFoundException(`Unknown symbol ${key}`);
    return details;
  }

  history(symbol: string, range: HistoryRange) {
    const key = symbol.toUpperCase();
    const ttl = range === "1d" || range === "5d" ? MINUTE : 15 * MINUTE;
    return this.cache.get(`history:${key}:${range}`, ttl, () =>
      this.provider.history(key, range),
    );
  }

  search(query: string) {
    const q = query.trim();
    if (!q) return Promise.resolve({ results: [], news: [] });
    return this.cache.get(`search:${q.toLowerCase()}`, 5 * MINUTE, () =>
      this.provider.search(q),
    );
  }
}
