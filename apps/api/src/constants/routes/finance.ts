export const FINANCE_ROUTES = {
  BASE: "/finance",
  OVERVIEW: "/overview",
  QUOTES: "/quotes",
  SEARCH: "/search",
  STOCK: "/stocks/:symbol",
  HISTORY: "/stocks/:symbol/history",
  tag: "finance",
} as const;
