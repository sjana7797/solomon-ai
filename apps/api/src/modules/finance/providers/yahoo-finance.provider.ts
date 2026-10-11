import { Injectable } from "@nestjs/common";
import YahooFinance from "yahoo-finance2";

import type {
  HistoryRange,
  Market,
  NewsItem,
  PricePoint,
  Quote,
  SearchResult,
  StockDetails,
} from "../finance.types.js";
import type { MarketDataProvider } from "./market-data.provider.js";

/*
 * Yahoo Finance via the unofficial `yahoo-finance2` client. Fine for
 * development; Yahoo's terms don't allow commercial use, so production should
 * bind a licensed provider to MARKET_DATA_PROVIDER instead.
 */

// NIFTY 50 constituents: Indian movers are ranked from these (Yahoo has no
// Indian day-gainers screener).
const NIFTY_50 = [
  "RELIANCE",
  "HDFCBANK",
  "ICICIBANK",
  "INFY",
  "TCS",
  "BHARTIARTL",
  "ITC",
  "LT",
  "SBIN",
  "KOTAKBANK",
  "AXISBANK",
  "HINDUNILVR",
  "BAJFINANCE",
  "MARUTI",
  "SUNPHARMA",
  "HCLTECH",
  "M&M",
  "NTPC",
  "TITAN",
  "ULTRACEMCO",
  "ASIANPAINT",
  "POWERGRID",
  "TATASTEEL",
  "ONGC",
  "NESTLEIND",
  "JSWSTEEL",
  "ADANIENT",
  "ADANIPORTS",
  "WIPRO",
  "COALINDIA",
  "BAJAJFINSV",
  "TECHM",
  "GRASIM",
  "HINDALCO",
  "CIPLA",
  "DRREDDY",
  "SBILIFE",
  "HDFCLIFE",
  "BRITANNIA",
  "EICHERMOT",
  "APOLLOHOSP",
  "TATACONSUM",
  "BAJAJ-AUTO",
  "HEROMOTOCO",
  "INDUSINDBK",
  "SHRIRAMFIN",
  "BEL",
  "TRENT",
  "JIOFIN",
  "ETERNAL",
].map((s) => `${s}.NS`);

const RANGE_PLAN: Record<
  HistoryRange,
  { days: number; interval: "5m" | "30m" | "1d" | "1wk" }
> = {
  // Intraday ranges look back further, then keep only the latest session(s).
  "1d": { days: 5, interval: "5m" },
  "5d": { days: 9, interval: "30m" },
  "1mo": { days: 31, interval: "1d" },
  "6mo": { days: 183, interval: "1d" },
  "1y": { days: 366, interval: "1d" },
  "5y": { days: 5 * 366, interval: "1wk" },
};

type YahooClient = InstanceType<typeof YahooFinance>;
type YahooQuote = Awaited<ReturnType<YahooClient["quote"]>>[number];

const str = (obj: object, key: string): string | null => {
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
};

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function toQuote(q: YahooQuote): Quote {
  const time = q.regularMarketTime;
  return {
    symbol: q.symbol,
    name: q.longName ?? q.shortName ?? q.symbol,
    price: num(q.regularMarketPrice),
    change: num(q.regularMarketChange),
    changePercent: num(q.regularMarketChangePercent),
    currency: q.currency ?? null,
    exchange: q.fullExchangeName ?? q.exchange ?? null,
    marketState: q.marketState ?? null,
    time: time instanceof Date ? time.getTime() : null,
  };
}

@Injectable()
export class YahooFinanceProvider implements MarketDataProvider {
  private readonly client = new YahooFinance({
    suppressNotices: ["yahooSurvey"],
  });

  async quotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];
    const results = await this.client.quote(symbols, { return: "array" });
    return results.map(toQuote);
  }

  async details(symbol: string): Promise<StockDetails | null> {
    const [quote] = await this.quotes([symbol]);
    if (!quote) return null;
    const summary = await this.client
      .quoteSummary(symbol, {
        modules: [
          "summaryDetail",
          "defaultKeyStatistics",
          "assetProfile",
          "price",
        ],
      })
      .catch(() => null);
    const detail = summary?.summaryDetail;
    const stats = summary?.defaultKeyStatistics;
    const profile = summary?.assetProfile;
    return {
      quote,
      stats: {
        open: num(detail?.open),
        dayLow: num(detail?.dayLow),
        dayHigh: num(detail?.dayHigh),
        previousClose: num(detail?.previousClose),
        fiftyTwoWeekLow: num(detail?.fiftyTwoWeekLow),
        fiftyTwoWeekHigh: num(detail?.fiftyTwoWeekHigh),
        marketCap: num(detail?.marketCap ?? summary?.price?.marketCap),
        peRatio: num(detail?.trailingPE),
        eps: num(stats?.trailingEps),
        dividendYield: num(detail?.dividendYield),
        volume: num(detail?.volume),
        averageVolume: num(detail?.averageVolume),
      },
      profile: {
        sector: profile?.sector ?? null,
        industry: profile?.industry ?? null,
        website: profile?.website ?? null,
        summary: profile?.longBusinessSummary ?? null,
      },
    };
  }

  async history(symbol: string, range: HistoryRange): Promise<PricePoint[]> {
    const plan = RANGE_PLAN[range];
    const chart = await this.client.chart(symbol, {
      period1: new Date(Date.now() - plan.days * 864e5),
      interval: plan.interval,
    });
    const points = chart.quotes
      .filter((q) => typeof q.close === "number")
      .map((q) => ({ time: q.date.getTime(), close: q.close as number }));
    if (range === "1d" && points.length) {
      // Keep only the latest trading session.
      const lastDay = new Date(points.at(-1)!.time).toDateString();
      return points.filter((p) => new Date(p.time).toDateString() === lastDay);
    }
    return points;
  }

  async search(query: string) {
    const res = await this.client.search(query, {
      quotesCount: 8,
      newsCount: 6,
    });
    const results: SearchResult[] = res.quotes
      .filter(
        (q): q is typeof q & { symbol: string } =>
          "symbol" in q && typeof q.symbol === "string",
      )
      .map((q) => ({
        symbol: q.symbol,
        name: str(q, "longname") ?? str(q, "shortname") ?? q.symbol,
        exchange: str(q, "exchDisp") ?? str(q, "exchange"),
        type: str(q, "quoteType"),
      }));
    const news: NewsItem[] = res.news.map((n) => ({
      title: n.title,
      url: n.link,
      publisher: n.publisher ?? null,
      publishedAt:
        n.providerPublishTime instanceof Date
          ? n.providerPublishTime.getTime()
          : null,
    }));
    return { results, news };
  }

  async movers(market: Market, count: number) {
    if (market === "US") {
      const [gainers, losers] = await Promise.all([
        this.client.screener({ scrIds: "day_gainers", count }),
        this.client.screener({ scrIds: "day_losers", count }),
      ]);
      return {
        gainers: gainers.quotes.map((q) => toQuote(q as unknown as YahooQuote)),
        losers: losers.quotes.map((q) => toQuote(q as unknown as YahooQuote)),
      };
    }
    const ranked = (await this.quotes(NIFTY_50))
      .filter((q) => q.changePercent !== null)
      .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
    // Only real risers/fallers: on a broad up day there may be few losers.
    return {
      gainers: ranked.filter((q) => (q.changePercent ?? 0) > 0).slice(0, count),
      losers: ranked
        .filter((q) => (q.changePercent ?? 0) < 0)
        .slice(-count)
        .reverse(),
    };
  }
}
