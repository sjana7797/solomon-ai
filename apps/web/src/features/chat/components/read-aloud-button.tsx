"use client";

import { Loader } from "@repo/ui/components/motion/loader";
import { cn } from "@repo/ui/lib/utils";
import { SquareIcon, Volume2Icon } from "lucide-react";

import { startReadAloud, stopReadAloud, useReadAloud } from "../lib/read-aloud";

/** Speaker button in an answer's action row; runs the local TTS model. */
export function ReadAloudButton({ messageId, text }: { messageId: string; text: string }) {
  const status = useReadAloud(messageId);
  const active = status !== "idle";
  const label = status === "loading" ? "Preparing audio" : active ? "Stop reading" : "Read aloud";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={() => (active ? stopReadAloud() : void startReadAloud(messageId, text))}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-muted text-foreground",
      )}
    >
      {status === "loading" ? (
        <Loader variant="dots" size={12} label="Preparing audio" />
      ) : status === "playing" ? (
        <SquareIcon className="size-3 fill-current" />
      ) : (
        <Volume2Icon className="size-3.5" />
      )}
    </button>
  );
}
