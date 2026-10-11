"use client";

import { Button } from "@repo/ui/components/motion/button";
import { cn } from "@repo/ui/lib/utils";
import { BrainIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";

import { useMemory, useMemoryActions } from "../hooks/use-memory";
import type { MemoryCategory } from "../types";

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  identity: "About you",
  preference: "Preferences",
  interest: "Interests",
  project: "Projects",
  other: "Other",
};
const CATEGORY_ORDER: MemoryCategory[] = ["identity", "preference", "project", "interest", "other"];

function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-card shadow-sm transition-transform duration-200 ease-out",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function MemorySettings() {
  const { data, isPending, isError, refetch } = useMemory();
  const { setEnabled, remove, clear } = useMemoryActions();
  const [confirmClear, setConfirmClear] = useState(false);

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: (data?.memories ?? []).filter((m) => m.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <section aria-labelledby="memory-heading" className="space-y-6">
      <div className="flex items-start justify-between gap-6 border-b pb-4">
        <div>
          <h2 id="memory-heading" className="text-lg font-medium">
            Memory
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Solomon remembers things you tell it about yourself (your work, preferences and
            projects) and uses them in future chats. Memories are encrypted and stay on your
            server. Long chats are also summarised so answers keep earlier context.
          </p>
        </div>
        <Switch
          label="Use memory"
          checked={data?.enabled ?? true}
          disabled={isPending || isError}
          onCheckedChange={(enabled) => setEnabled.mutate(enabled)}
        />
      </div>

      {isPending ? (
        <div aria-busy="true" className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Couldn&apos;t load memories. Is the AI service running?</span>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : data.memories.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center">
          <BrainIcon className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium">Nothing remembered yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {data.enabled
              ? "Tell Solomon about yourself, like “I'm a designer in Pune” or “keep answers short”, and it'll remember."
              : "Memory is off. Turn it on to let Solomon remember things across chats."}
          </p>
        </div>
      ) : (
        <>
          {!data.enabled && (
            <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              Memory is off: these aren&apos;t used in chats and nothing new is saved.
            </p>
          )}
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.category}>
                <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {CATEGORY_LABELS[group.category]}
                </h3>
                <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card">
                  {group.items.map((memory) => (
                    <li key={memory.id} className="group flex items-center gap-3 py-2.5 pr-2 pl-4">
                      <span className="min-w-0 flex-1 text-sm leading-6">{memory.content}</span>
                      <button
                        type="button"
                        onClick={() => remove.mutate(memory.id)}
                        aria-label={`Forget: ${memory.content}`}
                        title="Forget"
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
                      >
                        <XIcon className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {data.memories.length} {data.memories.length === 1 ? "memory" : "memories"}
            </span>
            {confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Forget everything?</span>
                <Button variant="secondary" size="sm" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-destructive text-white hover:bg-destructive/85"
                  onClick={() => {
                    clear.mutate();
                    setConfirmClear(false);
                  }}
                >
                  Forget all
                </Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setConfirmClear(true)}>
                <Trash2Icon className="size-3.5" />
                Forget everything
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
