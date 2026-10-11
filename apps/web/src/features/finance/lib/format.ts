const CURRENCY_LOCALE: Record<string, string> = { INR: "en-IN" };

export function formatPrice(value: number | null | undefined, currency?: string | null) {
  if (value == null) return "—";
  const locale = (currency && CURRENCY_LOCALE[currency]) ?? "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: currency ? "currency" : "decimal",
      currency: currency ?? undefined,
      maximumFractionDigits: value < 1 ? 4 : 2,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

export function formatCompact(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(
    value,
  );
}

export function formatChange(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

export function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function trend(value: number | null | undefined): "up" | "down" | "flat" {
  if (!value) return "flat";
  return value > 0 ? "up" : "down";
}

export function formatAsOf(time: number | null | undefined, marketState?: string | null) {
  if (!time) return null;
  const when = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
  const state = marketState === "REGULAR" ? "Market open" : marketState ? "Market closed" : null;
  return state ? `${state} · ${when}` : when;
}

/** Display ticker: drop Yahoo's exchange suffixes and index caret. */
export function displaySymbol(symbol: string) {
  return symbol.replace(/^\^/, "").replace(/\.(NS|BO)$/, "").replace(/=X$/, "");
}
