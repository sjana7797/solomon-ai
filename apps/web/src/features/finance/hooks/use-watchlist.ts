"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "solomon:finance-watchlist";
const DEFAULT: string[] = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "AAPL", "NVDA"];
const EMPTY: string[] = [];

const listeners = new Set<() => void>();
let cached: string[] | undefined;

function read(): string[] {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : DEFAULT;
    cached = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : DEFAULT;
  } catch {
    cached = DEFAULT;
  }
  return cached;
}

function write(next: string[]) {
  cached = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the list lasts for this tab only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Watchlist symbols, kept in this browser. */
export function useWatchlist() {
  const symbols = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = useCallback((symbol: string) => {
    const current = read();
    write(current.includes(symbol) ? current.filter((s) => s !== symbol) : [...current, symbol]);
  }, []);
  return { symbols, has: (symbol: string) => symbols.includes(symbol), toggle };
}
