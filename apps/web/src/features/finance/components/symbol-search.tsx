"use client";

import { Loader } from "@repo/ui/components/motion/loader";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { useTRPC } from "@/trpc/client";

import { displaySymbol } from "../lib/format";

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Company / ticker search that opens the stock page. */
export function SymbolSearch({ className }: { className?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const listId = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const q = useDebounced(text.trim(), 250);
  const { data, isFetching } = useQuery(
    trpc.finance.search.queryOptions({ q }, { enabled: q.length > 0, staleTime: 5 * 60_000 }),
  );
  const results = q ? (data?.results ?? []) : [];

  const go = (symbol: string) => {
    setOpen(false);
    setText("");
    router.push(`/finance/${encodeURIComponent(symbol)}`);
  };

  return (
    <div className={cn("relative", className)}>
      <div className="flex h-11 items-center gap-2 rounded-full border border-border/70 bg-card px-4 transition-colors focus-within:border-primary/70">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (event.key === "Enter" && results[highlight]) {
              go(results[highlight].symbol);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Search stocks, indices, crypto…"
          aria-label="Search markets"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {isFetching && <Loader variant="dots" size={14} label="Searching" />}
      </div>
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-border/70 bg-popover p-1 shadow-lg"
        >
          {results.map((result, i) => (
            <li key={result.symbol} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(result.symbol)}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm",
                  i === highlight && "bg-muted",
                )}
              >
                <span className="w-24 shrink-0 truncate font-semibold">{displaySymbol(result.symbol)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{result.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {[result.exchange, result.type?.toLowerCase()].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
