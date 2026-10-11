"use client";

import { CitationFavicon } from "@repo/ui/components/agents/citations";
import { Button } from "@repo/ui/components/motion/button";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/motion/tabs";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, SparklesIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { usePreferredModel, useSendMessage } from "@/features/chat";
import { useTRPC } from "@/trpc/client";

import { useWatchlist } from "../hooks/use-watchlist";
import {
  displaySymbol,
  formatAsOf,
  formatCompact,
  formatNumber,
  formatPrice,
} from "../lib/format";
import { HISTORY_RANGES, type HistoryRange, type StockDetails } from "../types";
import { ChangeText } from "./change-text";
import { FinanceDisclaimer } from "./finance-disclaimer";
import { FinanceHeader } from "./finance-header";
import { PriceChart } from "./price-chart";

const RANGE_LABELS: Record<HistoryRange, string> = {
  "1d": "1D",
  "5d": "5D",
  "1mo": "1M",
  "6mo": "6M",
  "1y": "1Y",
  "5y": "5Y",
};

function timeAgo(time: number | null) {
  if (!time) return null;
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / (60 * 24))}d ago`;
}

function Chart({ symbol, details }: { symbol: string; details: StockDetails }) {
  const trpc = useTRPC();
  const [range, setRange] = useState<HistoryRange>("1d");
  const { data, isPending, isError } = useQuery(
    trpc.finance.history.queryOptions(
      { symbol, range },
      { refetchInterval: range === "1d" ? 60_000 : false, placeholderData: (prev) => prev },
    ),
  );

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <Tabs value={range} onValueChange={(v) => setRange(v as HistoryRange)} variant="pill">
        <TabsList className="bg-muted">
          {HISTORY_RANGES.map((r) => (
            <TabsTrigger key={r} value={r}>
              {RANGE_LABELS[r]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="mt-4">
        {isPending ? (
          <div className="h-[260px] animate-pulse rounded-xl bg-muted/70" />
        ) : isError ? (
          <div className="grid h-[260px] place-items-center text-sm text-muted-foreground">
            Couldn&apos;t load the chart.
          </div>
        ) : (
          <PriceChart
            points={data}
            range={range}
            currency={details.quote.currency}
            baseline={range === "1d" ? details.stats.previousClose : null}
          />
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2.5 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Stats({ details }: { details: StockDetails }) {
  const { stats, quote } = details;
  const price = (v: number | null) => formatPrice(v, quote.currency);
  const range = (lo: number | null, hi: number | null) =>
    lo == null || hi == null ? "—" : `${formatNumber(lo)} – ${formatNumber(hi)}`;
  const items: [string, string][] = [
    ["Open", price(stats.open)],
    ["Previous close", price(stats.previousClose)],
    ["Day range", range(stats.dayLow, stats.dayHigh)],
    ["52-week range", range(stats.fiftyTwoWeekLow, stats.fiftyTwoWeekHigh)],
    ["Market cap", formatCompact(stats.marketCap)],
    ["P/E ratio", formatNumber(stats.peRatio)],
    ["EPS", formatNumber(stats.eps)],
    ["Dividend yield", stats.dividendYield == null ? "—" : `${(stats.dividendYield * 100).toFixed(2)}%`],
    ["Volume", formatCompact(stats.volume)],
    ["Avg. volume", formatCompact(stats.averageVolume)],
  ];
  const half = Math.ceil(items.length / 2);
  return (
    <section className="rounded-2xl border border-border/70 bg-card px-4 py-2">
      <dl className="grid gap-x-8 sm:grid-cols-2">
        {[items.slice(0, half), items.slice(half)].map((column, i) => (
          <div key={i}>
            {column.map(([label, value]) => (
              <Stat key={label} label={label} value={value} />
            ))}
          </div>
        ))}
      </dl>
    </section>
  );
}

function News({ query }: { query: string }) {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.finance.search.queryOptions({ q: query }, { staleTime: 5 * 60_000 }));
  if (!data?.news.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">News</h2>
      <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card">
        {data.news.map((item) => (
          <li key={item.url}>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="block px-4 py-3 transition-colors hover:bg-muted/60"
            >
              <div className="text-sm leading-5 font-medium">{item.title}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CitationFavicon url={item.url} className="size-4 [&_img]:size-3.5" />
                <span className="truncate">{item.publisher}</span>
                {timeAgo(item.publishedAt) && <span>· {timeAgo(item.publishedAt)}</span>}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function About({ profile }: { profile: StockDetails["profile"] }) {
  const [expanded, setExpanded] = useState(false);
  if (!profile.summary && !profile.sector) return null;
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <h2 className="text-sm font-semibold">About</h2>
      {(profile.sector || profile.industry) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {[profile.sector, profile.industry].filter(Boolean).join(" · ")}
        </p>
      )}
      {profile.summary && (
        <>
          <p className={cn("mt-3 text-sm leading-6 text-muted-foreground", !expanded && "line-clamp-4")}>
            {profile.summary}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-1 text-xs font-medium text-accent-foreground hover:underline"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        </>
      )}
      {profile.website && (
        <a
          href={profile.website}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block truncate text-xs text-accent-foreground hover:underline"
        >
          {profile.website.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      )}
    </section>
  );
}

export function StockPage({ symbol }: { symbol: string }) {
  const trpc = useTRPC();
  const { has, toggle } = useWatchlist();
  const [model] = usePreferredModel();
  const send = useSendMessage();
  const { data, isPending, isError, error, refetch } = useQuery(
    trpc.finance.stock.queryOptions({ symbol }, { refetchInterval: 60_000 }),
  );
  const watched = has(symbol);

  const ask = () => {
    if (!model || !data) return;
    void send({
      text: `How is ${data.quote.name} (${data.quote.symbol}) doing? Summarise the latest price move, key numbers and recent news.`,
      model,
      thinking: false,
      webSearch: true,
    });
  };

  return (
    <>
      <FinanceHeader>
        <Link
          href="/finance"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Finance
        </Link>
      </FinanceHeader>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
          {isPending ? (
            <div aria-busy="true" className="space-y-4 pt-2">
              <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
              <div className="h-12 w-48 animate-pulse rounded-lg bg-muted" />
              <div className="h-[340px] animate-pulse rounded-2xl bg-muted" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <p className="font-medium">
                {error.data?.code === "NOT_FOUND"
                  ? `No market data for “${symbol}”.`
                  : "Couldn't load market data."}
              </p>
              {error.data?.code !== "NOT_FOUND" && (
                <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                  Retry
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-5 pt-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-semibold tracking-wide text-secondary-foreground">
                      {displaySymbol(data.quote.symbol)}
                    </span>
                    {data.quote.exchange}
                  </div>
                  <h1 className="mt-1.5 font-display text-3xl tracking-[-0.02em] sm:text-4xl">
                    {data.quote.name}
                  </h1>
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-4xl font-semibold tracking-tight tabular-nums">
                      {formatPrice(data.quote.price, data.quote.currency)}
                    </span>
                    <ChangeText change={data.quote.change} changePercent={data.quote.changePercent} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatAsOf(data.quote.time, data.quote.marketState)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => toggle(symbol)}
                    aria-pressed={watched}
                    className="gap-1.5 rounded-full"
                  >
                    <StarIcon className={cn("size-3.5", watched && "fill-current text-amber-500")} />
                    {watched ? "Watching" : "Watch"}
                  </Button>
                  <Button size="sm" onClick={ask} disabled={!model} className="gap-1.5 rounded-full">
                    <SparklesIcon className="size-3.5" />
                    Ask Solomon
                  </Button>
                </div>
              </div>

              <Chart symbol={symbol} details={data} />

              <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                <div className="space-y-5">
                  <Stats details={data} />
                  <News query={data.quote.name} />
                </div>
                <div>
                  <About profile={data.profile} />
                </div>
              </div>
              <FinanceDisclaimer />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
