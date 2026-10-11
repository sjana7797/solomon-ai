"use client";

import { CitationFavicon } from "@repo/ui/components/agents/citations";
import { FileTextIcon } from "lucide-react";

import type { Source } from "../types";
import { useSourcesPanel } from "./sources-panel";

const VISIBLE = 3;

/** Compact source cards above the answer; the last card opens the full panel. */
export function SourceStrip({ sources }: { sources: Source[] }) {
  const openSources = useSourcesPanel();
  const visible = sources.length <= VISIBLE + 1 ? sources : sources.slice(0, VISIBLE);
  const hidden = sources.slice(visible.length);

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {visible.map((source) => (
        <button
          key={source.index}
          type="button"
          onClick={() => openSources(sources, source.index)}
          className="flex min-h-[4.5rem] flex-col justify-between rounded-xl bg-muted/60 p-2.5 text-left transition-colors hover:bg-muted"
        >
          <span className="line-clamp-2 text-xs leading-4 font-medium">{source.title}</span>
          <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {source.kind === "document" ? (
              <FileTextIcon className="size-3.5 shrink-0" />
            ) : (
              <CitationFavicon url={source.url} className="size-3.5 [&_img]:size-3.5" />
            )}
            <span className="truncate">{source.kind === "document" ? "Your file" : source.domain}</span>
            <span className="ml-auto tabular-nums">{source.index}</span>
          </span>
        </button>
      ))}
      {hidden.length > 0 && (
        <button
          type="button"
          onClick={() => openSources(sources)}
          className="flex min-h-[4.5rem] flex-col justify-between rounded-xl bg-muted/60 p-2.5 text-left transition-colors hover:bg-muted"
        >
          <span className="flex -space-x-1">
            {hidden.slice(0, 4).map((source) => (
              <CitationFavicon
                key={source.index}
                url={source.url}
                className="size-4 rounded-full bg-background ring-2 ring-muted [&_img]:size-3"
              />
            ))}
          </span>
          <span className="text-[11px] text-muted-foreground">View {hidden.length} more</span>
        </button>
      )}
    </div>
  );
}
