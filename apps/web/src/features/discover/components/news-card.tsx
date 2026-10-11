"use client";

import { CitationFavicon } from "@repo/ui/components/agents/citations";
import { cn } from "@repo/ui/lib/utils";
import { SparklesIcon } from "lucide-react";

import type { NewsItem } from "../config";
import { NewsImage } from "./news-image";

function timeAgo(iso: string | null) {
  if (!iso) return null;
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / (60 * 24))}d ago`;
}

function Meta({ item }: { item: NewsItem }) {
  const ago = timeAgo(item.publishedAt);
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <CitationFavicon url={item.url} className="size-4 [&_img]:size-3.5" />
      <span className="truncate">{item.source}</span>
      {ago && <span className="shrink-0">· {ago}</span>}
    </span>
  );
}

function AskButton({
  onAsk,
  title,
  disabled,
}: {
  onAsk: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onAsk}
      disabled={disabled}
      aria-label={`Ask Solomon about: ${title}`}
      className="relative z-10 inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-primary/25 px-2.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-primary/45 disabled:cursor-wait disabled:opacity-50"
    >
      <SparklesIcon className="size-3" />
      Ask
    </button>
  );
}

/** Whole card opens the article (stretched link); "Ask" starts a search chat. */
export function NewsCard({
  item,
  onAsk,
  canAsk = true,
  lead = false,
}: {
  item: NewsItem;
  onAsk: () => void;
  /** False until a model is available to answer. */
  canAsk?: boolean;
  lead?: boolean;
}) {
  const link = (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none"
    >
      {item.title}
    </a>
  );

  if (lead) {
    return (
      <article className="group relative grid gap-5 rounded-3xl p-2 transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50 md:grid-cols-[1.35fr_1fr] md:items-center">
        <NewsImage
          src={item.image}
          alt=""
          source={item.source}
          sizes="(min-width: 768px) 560px, 100vw"
          className="aspect-[16/10] rounded-2xl"
        />
        <div className="flex flex-col gap-3 px-1 pb-2 md:pr-4">
          <h2 className="font-display text-[1.75rem] leading-[1.1] tracking-[-0.01em] text-balance sm:text-[2.125rem]">
            {link}
          </h2>
          {item.snippet && (
            <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{item.snippet}</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <Meta item={item} />
            <AskButton onAsk={onAsk} title={item.title} disabled={!canAsk} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl p-2 transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50",
      )}
    >
      <NewsImage
        src={item.image}
        alt=""
        source={item.source}
        sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 100vw"
        className="aspect-[16/9] rounded-xl"
      />
      <h3 className="line-clamp-3 px-1 text-[0.95rem] leading-snug font-medium">{link}</h3>
      <div className="mt-auto flex items-center justify-between gap-2 px-1 pb-1">
        <Meta item={item} />
        <AskButton onAsk={onAsk} title={item.title} disabled={!canAsk} />
      </div>
    </article>
  );
}
