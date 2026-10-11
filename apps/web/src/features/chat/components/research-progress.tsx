"use client";

import { AgentDisclosure } from "@repo/ui/components/agents/agent-disclosure";
import { ReasoningText } from "@repo/ui/components/agents/loading-states/reasoning-text";
import { cn } from "@repo/ui/lib/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  LoaderIcon,
  TelescopeIcon,
  XIcon,
} from "lucide-react";
import { useId, useState } from "react";

import type { ResearchProgress as Progress, ResearchStep } from "../types";

const STAGE_PHRASES: Record<Progress["stage"], string[]> = {
  planning: ["Planning the research", "Breaking the question down"],
  researching: ["Researching", "Reading sources", "Taking notes"],
  reflecting: ["Checking for gaps", "Deciding what's missing"],
  writing: ["Writing the report", "Pulling the findings together"],
};

function StepIcon({ status }: { status: ResearchStep["status"] }) {
  if (status === "done") return <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
  if (status === "failed") return <XIcon className="size-3.5 text-destructive" />;
  if (status === "pending") return <CircleIcon className="size-3 text-muted-foreground/50" />;
  return <LoaderIcon className="size-3.5 animate-spin text-primary-foreground dark:text-primary" />;
}

const STATUS_LABEL: Record<ResearchStep["status"], string> = {
  pending: "Queued",
  searching: "Searching",
  reading: "Reading",
  done: "Done",
  failed: "Couldn't search",
};

/** Live checklist of the research plan; collapses to a summary once the report starts. */
export function ResearchProgress({
  progress,
  active,
  sourceCount,
}: {
  progress: Progress;
  /** Still researching (no report text yet). */
  active: boolean;
  sourceCount: number;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const expanded = active || open;
  const done = progress.steps.filter((s) => s.status === "done").length;

  return (
    <div className="mb-4 rounded-2xl border border-border/70 bg-card/60 px-4 py-3">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        disabled={active}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground disabled:cursor-default"
      >
        <TelescopeIcon className="size-4 shrink-0 text-accent-foreground" />
        <span className="min-w-0 flex-1">
          {active ? (
            <ReasoningText key={progress.stage} phrases={STAGE_PHRASES[progress.stage]} variant="swap" />
          ) : (
            <span className="font-medium text-foreground">
              Researched {progress.steps.length} questions
              <span className="font-normal text-muted-foreground">
                {" "}· {sourceCount} sources · {progress.round} {progress.round === 1 ? "round" : "rounds"}
              </span>
            </span>
          )}
        </span>
        {active && progress.steps.length > 0 && (
          <span className="shrink-0 text-xs tabular-nums">
            {done}/{progress.steps.length}
          </span>
        )}
        {!active && (
          <ChevronDownIcon className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
        )}
      </button>
      <AgentDisclosure open={expanded && progress.steps.length > 0} id={contentId}>
        <ol className="mt-3 space-y-2 border-t border-border/60 pt-3">
          {progress.steps.map((step) => (
            <li key={step.id} className="flex items-start gap-2.5 text-sm">
              <span className="mt-1 grid size-4 shrink-0 place-items-center">
                <StepIcon status={step.status} />
              </span>
              <span className="min-w-0 flex-1 leading-6">{step.question}</span>
              <span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">
                {step.status === "done"
                  ? `${step.sources} ${step.sources === 1 ? "source" : "sources"}`
                  : STATUS_LABEL[step.status]}
              </span>
            </li>
          ))}
        </ol>
      </AgentDisclosure>
    </div>
  );
}
