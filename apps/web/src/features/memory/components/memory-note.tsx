"use client";

import { BrainIcon } from "lucide-react";
import Link from "next/link";

import type { MemoryChange } from "../types";

const VERB = { add: "Remembered", update: "Updated", delete: "Forgot" } as const;

/** "Memory updated" line under a reply, listing what changed. */
export function MemoryNote({ changes }: { changes: MemoryChange[] }) {
  return (
    <details className="group mt-3 text-xs text-muted-foreground">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 font-medium text-accent-foreground transition-colors hover:bg-primary/25 [&::-webkit-details-marker]:hidden">
        <BrainIcon className="size-3" />
        Memory updated
      </summary>
      <ul className="mt-2 space-y-1 border-l-2 border-primary/40 pl-3">
        {changes.map((change, i) => (
          <li key={i}>
            <span className="font-medium text-foreground/80">{VERB[change.op]}:</span>{" "}
            {change.content}
          </li>
        ))}
        <li>
          <Link href="/settings" className="text-accent-foreground hover:underline">
            Manage memory
          </Link>
        </li>
      </ul>
    </details>
  );
}
