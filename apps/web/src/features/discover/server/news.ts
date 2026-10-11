import "server-only";

import { COUNTRIES, TOPICS, type CountryCode, type NewsItem, type TopicId } from "../config";

const SEARXNG_URL = (process.env.SEARXNG_URL ?? "http://localhost:8080").replace(/\/$/, "");
const CACHE_TTL_MS = 15 * 60 * 1000;

type SearxResult = {
  title?: string;
  url?: string;
  content?: string;
  publishedDate?: string | null;
  thumbnail?: string;
  img_src?: string;
};

const cache = new Map<string, { at: number; items: NewsItem[] }>();

async function searchNews(query: string): Promise<SearxResult[]> {
  const params = new URLSearchParams({
    q: query,
    categories: "news",
    format: "json",
    language: "en",
    time_range: "week",
  });
  const res = await fetch(`${SEARXNG_URL}/search?${params}`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SearXNG responded with ${res.status}`);
  const data = (await res.json()) as { results?: SearxResult[] };
  return data.results ?? [];
}

function toItem(result: SearxResult): NewsItem | null {
  if (!result.url || !result.title) return null;
  const image = result.thumbnail || result.img_src || null;
  return {
    id: result.url,
    title: result.title.trim(),
    url: result.url,
    source: new URL(result.url).hostname.replace(/^www\./, ""),
    snippet: (result.content ?? "").replace(/\s+/g, " ").trim(),
    image: image?.startsWith("https://") ? image : null,
    publishedAt: result.publishedDate ?? null,
  };
}

/** Recent news for a country and topic via SearXNG, cached for 15 minutes. */
export async function getNews(country: CountryCode, topic: TopicId): Promise<NewsItem[]> {
  const key = `${country}:${topic}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items;

  const name = COUNTRIES.find((c) => c.code === country)!.name;
  const terms = TOPICS.find((t) => t.id === topic)!.terms;
  const batches = await Promise.allSettled(
    terms.map((term) => searchNews(`${name} ${term}`.trim())),
  );

  // Interleave the queries' results so one doesn't dominate, then de-duplicate.
  const lists = batches.map((b) => (b.status === "fulfilled" ? b.value : []));
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) {
    for (const list of lists) {
      const item = list[i] && toItem(list[i]!);
      if (!item || seen.has(item.url) || seen.has(item.title)) continue;
      seen.add(item.url);
      seen.add(item.title);
      items.push(item);
    }
  }
  // Stories with images first keep the feed visual; order is otherwise preserved.
  items.sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image)));

  if (items.length === 0 && batches.every((b) => b.status === "rejected")) {
    throw new Error("News search is unavailable");
  }
  cache.set(key, { at: Date.now(), items });
  return items;
}
