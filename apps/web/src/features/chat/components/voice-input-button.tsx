"use client";

import { Loader } from "@repo/ui/components/motion/loader";
import { MicIcon, SquareIcon, XIcon } from "lucide-react";

import type { VoiceInputStatus } from "../hooks/use-voice-input";

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Mic control for the composer: idle → recording (timer, stop, cancel) → transcribing. */
export function VoiceInputButton({
  status,
  seconds,
  disabled,
  onStart,
  onStop,
  onCancel,
}: {
  status: VoiceInputStatus;
  seconds: number;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}) {
  if (status === "recording") {
    return (
      <span className="flex h-8 items-center gap-1 rounded-full bg-destructive/10 pr-1 pl-2.5 text-xs text-destructive">
        <span aria-hidden className="size-2 animate-pulse rounded-full bg-destructive" />
        <span className="w-9 tabular-nums" aria-live="polite">
          {clock(seconds)}
        </span>
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop and transcribe"
          title="Stop and transcribe"
          className="grid size-6 place-items-center rounded-full transition-colors hover:bg-destructive/15"
        >
          <SquareIcon className="size-3 fill-current" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel recording"
          title="Cancel recording"
          className="grid size-6 place-items-center rounded-full transition-colors hover:bg-destructive/15"
        >
          <XIcon className="size-3.5" />
        </button>
      </span>
    );
  }

  if (status === "transcribing") {
    return (
      <span className="grid size-8 place-items-center text-muted-foreground" title="Transcribing…">
        <Loader variant="dots" size={14} label="Transcribing" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      aria-label="Speak your message"
      title="Speak your message (English)"
      className="grid size-8 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <MicIcon className="size-4" />
    </button>
  );
}
