import { cn } from "@repo/ui/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import {
  displaySymbol,
  formatAsOf,
  formatCompact,
  formatNumber,
  formatPrice,
} from "../lib/format";
import type { QuoteSnapshot } from "../types";
import { ChangeText } from "./change-text";

/** Where today's price sits between two bounds (day or 52-week range). */
function RangeBar({ low, high, value, label }: { low: number | null; high: number | null; value: number | null; label: string }) {
  if (low == null || high == null || value == null || high <= low) return null;
  const position = Math.min(Math.max((value - low) / (high - low), 0), 1) * 100;
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <div className="relative h-1 rounded-full bg-muted">
        <span
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{formatNumber(low)}</span>
        <span>{formatNumber(high)}</span>
      </div>
    </div>
  );
}

/** Compact live-quote card shown above chat answers about a security. */
export function QuoteCard({ quote, className }: { quote: QuoteSnapshot; className?: string }) {
  const { stats } = quote;
  const asOf = formatAsOf(quote.time, quote.marketState);
  return (
    <Link
      href={`/finance/${encodeURIComponent(quote.symbol)}`}
      className={cn(
        // Sits inside chat markdown, whose link styles would underline everything.
        "group block rounded-2xl border border-border/70 bg-card p-4 text-foreground no-underline! transition-colors hover:border-primary/60",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-secondary-foreground">
              {displaySymbol(quote.symbol)}
            </span>
            {quote.exchange && (
              <span className="truncate text-xs text-muted-foreground">{quote.exchange}</span>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-medium">{quote.name}</div>
        </div>
        <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatPrice(quote.price, quote.currency)}
        </span>
        <ChangeText change={quote.change} changePercent={quote.changePercent} className="text-sm" />
      </div>
      {asOf && <div className="mt-0.5 text-xs text-muted-foreground">{asOf}</div>}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <RangeBar label="Day range" low={stats.dayLow} high={stats.dayHigh} value={quote.price} />
        <RangeBar
          label="52-week range"
          low={stats.fiftyTwoWeekLow}
          high={stats.fiftyTwoWeekHigh}
          value={quote.price}
        />
      </div>
      {(stats.marketCap != null || stats.peRatio != null) && (
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          {stats.marketCap != null && (
            <span>
              Mkt cap <span className="font-medium text-foreground">{formatCompact(stats.marketCap)}</span>
            </span>
          )}
          {stats.peRatio != null && (
            <span>
              P/E <span className="font-medium text-foreground">{formatNumber(stats.peRatio)}</span>
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

export function QuoteCards({ quotes }: { quotes: QuoteSnapshot[] }) {
  return (
    <div className={cn("mb-4 grid gap-3", quotes.length > 1 && "sm:grid-cols-2")}>
      {quotes.map((quote) => (
        <QuoteCard key={quote.symbol} quote={quote} />
      ))}
    </div>
  );
}
