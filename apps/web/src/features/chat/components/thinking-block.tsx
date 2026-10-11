"use client";

import { AgentDisclosure } from "@repo/ui/components/agents/agent-disclosure";
import { ReasoningText } from "@repo/ui/components/agents/loading-states/reasoning-text";
import { cn } from "@repo/ui/lib/utils";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { useId, useState } from "react";

const PHRASES = ["Thinking", "Weighing the details", "Working it through", "Checking the reasoning"];

function formatDuration(ms: number) {
  const seconds = ms / 1000;
  return seconds < 1 ? "under a second" : seconds < 60 ? `${Math.round(seconds)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function ThinkingBlock({
  reasoning,
  reasoningMs,
  active,
}: {
  reasoning: string;
  reasoningMs?: number;
  /** Model is still reasoning (no answer text yet). */
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const hasReasoning = reasoning.trim().length > 0;

  return (
    <div className="mb-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        disabled={!hasReasoning}
        onClick={() => setOpen((value) => !value)}
        className="group inline-flex items-center gap-1.5 rounded-lg py-1 pr-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none"
      >
        {active ? (
          <ReasoningText phrases={PHRASES} variant="swap" />
        ) : (
          <>
            <BrainIcon className="size-3.5" />
            <span>
              {reasoningMs !== undefined
                ? `Thought for ${formatDuration(reasoningMs)}`
                : "Thought"}
            </span>
          </>
        )}
        {hasReasoning && (
          <ChevronDownIcon
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
          />
        )}
      </button>
      <AgentDisclosure open={open} id={contentId}>
        <div className="mt-1.5 max-h-72 overflow-y-auto border-l-2 border-primary/50 py-1 pl-3.5 text-[0.85rem] leading-6 whitespace-pre-wrap text-muted-foreground">
          {reasoning.trim().replace(/\n\s*\n/g, "\n")}
        </div>
      </AgentDisclosure>
    </div>
  );
}
