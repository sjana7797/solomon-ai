"use client";

import { Button } from "@repo/ui/components/motion/button";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/motion/tabs";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { StarIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useTRPC } from "@/trpc/client";

import { useWatchlist } from "../hooks/use-watchlist";
import { displaySymbol, formatAsOf, formatPrice } from "../lib/format";
import type { Market, Quote } from "../types";
import { ChangeText } from "./change-text";
import { FinanceDisclaimer } from "./finance-disclaimer";
import { FinanceHeader } from "./finance-header";
import { SymbolSearch } from "./symbol-search";

const MARKET_KEY = "solomon:finance-market";
const REFRESH_MS = 60_000;

function stockHref(symbol: string) {
  return `/finance/${encodeURIComponent(symbol)}`;
}

function IndexCard({ quote }: { quote: Quote }) {
  return (
    <Link
      href={stockHref(quote.symbol)}
      className="min-w-0 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/60"
    >
      <div className="truncate text-xs font-medium text-muted-foreground">{quote.name}</div>
      <div className="mt-2 truncate text-lg font-semibold tracking-tight tabular-nums">
        {formatPrice(quote.price, quote.symbol.endsWith("=X") ? quote.currency : null)}
      </div>
      <ChangeText change={quote.change} changePercent={quote.changePercent} className="text-xs" />
    </Link>
  );
}

function QuoteRow({ quote, action }: { quote: Quote; action?: React.ReactNode }) {
  return (
    <li className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/70">
      <Link href={stockHref(quote.symbol)} className="absolute inset-0 rounded-xl" aria-label={quote.name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{displaySymbol(quote.symbol)}</div>
        <div className="truncate text-xs text-muted-foreground">{quote.name}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-medium tabular-nums">{formatPrice(quote.price, quote.currency)}</div>
        <ChangeText
          change={quote.change}
          changePercent={quote.changePercent}
          showAbsolute={false}
          className="text-xs"
        />
      </div>
      {action && <div className="relative z-10">{action}</div>}
    </li>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border/70 bg-card p-2", className)}>
      <h2 className="px-3 pt-2 pb-1 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul aria-busy="true" className="space-y-1 p-1">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="h-12 animate-pulse rounded-xl bg-muted/70" />
      ))}
    </ul>
  );
}

function Watchlist() {
  const trpc = useTRPC();
  const { symbols, toggle } = useWatchlist();
  const { data, isPending, isError } = useQuery(
    trpc.finance.quotes.queryOptions(
      { symbols },
      { enabled: symbols.length > 0, refetchInterval: REFRESH_MS },
    ),
  );

  return (
    <Panel title="Watchlist">
      {symbols.length === 0 ? (
        <p className="px-3 pt-1 pb-3 text-sm text-muted-foreground">
          Star a stock on its page to follow it here.
        </p>
      ) : isPending ? (
        <RowsSkeleton rows={symbols.length} />
      ) : isError ? (
        <p className="px-3 pt-1 pb-3 text-sm text-muted-foreground">Couldn&apos;t load prices.</p>
      ) : (
        <ul className="space-y-0.5">
          {data.map((quote) => (
            <QuoteRow
              key={quote.symbol}
              quote={quote}
              action={
                <button
                  type="button"
                  onClick={() => toggle(quote.symbol)}
                  aria-label={`Remove ${quote.name} from watchlist`}
                  className="grid size-7 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-card hover:text-foreground focus-visible:opacity-100"
                >
                  <StarIcon className="size-3.5 fill-current" />
                </button>
              }
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function useMarket() {
  const [market, setMarketState] = useState<Market>("IN");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MARKET_KEY);
      if (saved === "IN" || saved === "US") setMarketState(saved);
    } catch {
      // Storage unavailable: keep the default.
    }
  }, []);
  const setMarket = (next: Market) => {
    setMarketState(next);
    try {
      localStorage.setItem(MARKET_KEY, next);
    } catch {
      // Ignore: choice just won't persist.
    }
  };
  return [market, setMarket] as const;
}

export function FinancePage() {
  const trpc = useTRPC();
  const [market, setMarket] = useMarket();
  const { data, isPending, isError, refetch, isRefetching } = useQuery(
    trpc.finance.overview.queryOptions({ market }, { refetchInterval: REFRESH_MS }),
  );
  const asOf = data?.indices[0] && formatAsOf(data.indices[0].time, data.indices[0].marketState);

  return (
    <>
      <FinanceHeader />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4 pt-2 pb-6">
            <div>
              <h1 className="font-display text-4xl tracking-[-0.02em] sm:text-5xl">Finance</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {asOf ?? "Markets, movers and the stocks you follow."}
              </p>
            </div>
            <Tabs value={market} onValueChange={(v) => setMarket(v as Market)} variant="pill">
              <TabsList className="bg-muted">
                <TabsTrigger value="IN">India</TabsTrigger>
                <TabsTrigger value="US">US</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <SymbolSearch className="mb-6" />

          {isError ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <p className="font-medium">Couldn&apos;t load market data.</p>
              <p className="text-sm text-muted-foreground">
                Check that the API service (apps/api, port 3003) is running, then retry.
              </p>
              <Button variant="secondary" size="sm" onClick={() => void refetch()} disabled={isRefetching}>
                {isRefetching ? "Retrying…" : "Retry"}
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {isPending
                  ? Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className="h-[6.5rem] animate-pulse rounded-2xl bg-muted" />
                    ))
                  : data.indices.map((quote) => <IndexCard key={quote.symbol} quote={quote} />)}
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <Panel title="Top gainers">
                  {isPending ? (
                    <RowsSkeleton />
                  ) : (
                    <ul className="space-y-0.5">
                      {data.gainers.map((q) => (
                        <QuoteRow key={q.symbol} quote={q} />
                      ))}
                    </ul>
                  )}
                </Panel>
                <Panel title="Top losers">
                  {isPending ? (
                    <RowsSkeleton />
                  ) : (
                    <ul className="space-y-0.5">
                      {data.losers.map((q) => (
                        <QuoteRow key={q.symbol} quote={q} />
                      ))}
                    </ul>
                  )}
                </Panel>
                <Watchlist />
              </div>
              {market === "IN" && (
                <p className="mt-3 text-xs text-muted-foreground">Movers ranked from NIFTY 50 stocks.</p>
              )}
            </>
          )}

          <div className="mt-10">
            <FinanceDisclaimer />
          </div>
        </div>
      </div>
    </>
  );
}
