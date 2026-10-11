"use client";

import { CitationFavicon } from "@repo/ui/components/agents/citations";
import { Drawer } from "@repo/ui/components/motion/drawer";
import { cn } from "@repo/ui/lib/utils";
import { FileTextIcon, XIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import type { Source } from "../types";

type OpenSources = (sources: Source[], highlight?: number) => void;

const SourcesPanelContext = createContext<OpenSources>(() => {});

/** Opens the Perplexity-style sources panel, optionally focused on citation [n]. */
export const useSourcesPanel = () => useContext(SourcesPanelContext);

export function SourcesPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Kept after closing so the panel still has content during its exit animation.
  const [sources, setSources] = useState<Source[]>([]);
  const [highlight, setHighlight] = useState<number>();

  const openSources = useCallback<OpenSources>((next, index) => {
    setSources(next);
    setHighlight(index);
    setOpen(true);
  }, []);

  return (
    <SourcesPanelContext.Provider value={openSources}>
      {children}
      <Drawer
        open={open}
        onOpenChange={setOpen}
        side="right"
        ariaLabel="Sources"
        className="w-[400px] max-w-[92vw]"
        backdropClassName="bg-black/10 backdrop-blur-[1px]"
      >
        <SourcesList sources={sources} highlight={highlight} onClose={() => setOpen(false)} />
      </Drawer>
    </SourcesPanelContext.Provider>
  );
}

function SourcesList({
  sources,
  highlight,
  onClose,
}: {
  sources: Source[];
  highlight?: number;
  onClose: () => void;
}) {
  const refs = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    if (highlight === undefined) return;
    refs.current.get(highlight)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight]);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <h2 className="text-sm font-medium">
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </h2>
        <button
          type="button"
          aria-label="Close sources"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </header>
      <ol className="flex-1 space-y-2 overflow-y-auto p-3">
        {sources.map((source) => (
          <li key={source.index}>
            <SourceCard
              source={source}
              highlighted={source.index === highlight}
              cardRef={(node) => {
                if (node) refs.current.set(source.index, node);
                else refs.current.delete(source.index);
              }}
            />
          </li>
        ))}
      </ol>
    </>
  );
}

/** Web sources link out; uploaded documents are the user's own files (no link). */
function SourceCard({
  source,
  highlighted,
  cardRef,
}: {
  source: Source;
  highlighted: boolean;
  cardRef: (node: HTMLElement | null) => void;
}) {
  const isDocument = source.kind === "document";
  const className = cn(
    "block rounded-xl border p-3 transition-colors",
    !isDocument && "hover:bg-muted/60",
    highlighted && "border-primary bg-accent/40",
  );
  const body = (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isDocument ? (
          <FileTextIcon className="size-4" />
        ) : (
          <CitationFavicon url={source.url} className="size-4" />
        )}
        <span className="truncate">{isDocument ? "Your file" : source.domain}</span>
        <span className="ml-auto grid size-5 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold">
          {source.index}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-medium">{source.title}</p>
      {source.snippet && (
        <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
          {source.snippet}
        </p>
      )}
    </>
  );

  return isDocument ? (
    <div ref={cardRef} className={className}>
      {body}
    </div>
  ) : (
    <a ref={cardRef} href={source.url} target="_blank" rel="noreferrer" className={className}>
      {body}
    </a>
  );
}
