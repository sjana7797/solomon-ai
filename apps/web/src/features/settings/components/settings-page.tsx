"use client";

import { AnimatedSidebarTrigger } from "@repo/ui/components/motion/animated-sidebar";
import { Button } from "@repo/ui/components/motion/button";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/motion/radio";
import { RangeSlider } from "@repo/ui/components/motion/range-slider";
import { PanelLeftIcon, SquareIcon, Volume2Icon } from "lucide-react";

import { startReadAloud, stopReadAloud, useReadAloud } from "@/features/chat/lib/read-aloud";

import { MemorySettings } from "@/features/memory/components/memory-settings";

import { setVoicePreferences, useVoicePreferences } from "../lib/voice-preferences";
import { SPEED_MAX, SPEED_MIN, SPEED_STEP, VOICES, type VoiceId } from "../voices";

const PREVIEW_ID = "settings-voice-preview";
const PREVIEW_TEXT =
  "Hi, I'm Solomon. This is how I'll sound when I read answers aloud to you.";

function formatSpeed(speed: number) {
  return `${Number(speed.toFixed(2))}×`;
}

function VoicePreviewButton() {
  const status = useReadAloud(PREVIEW_ID);
  const active = status !== "idle";
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => (active ? stopReadAloud() : void startReadAloud(PREVIEW_ID, PREVIEW_TEXT))}
    >
      {active ? <SquareIcon className="size-3 fill-current" /> : <Volume2Icon className="size-3.5" />}
      {status === "loading" ? "Preparing…" : active ? "Stop" : "Play a sample"}
    </Button>
  );
}

export function SettingsPage() {
  const { voice, speed } = useVoicePreferences();

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 px-3">
        <AnimatedSidebarTrigger className="size-8 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <PanelLeftIcon className="size-4" />
        </AnimatedSidebarTrigger>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 pb-16 sm:px-6">
          <h1 className="pt-2 pb-8 font-display text-4xl tracking-[-0.02em] sm:text-5xl">
            Settings
          </h1>

          <MemorySettings />

          <section aria-labelledby="read-aloud-heading" className="mt-14 space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
              <div>
                <h2 id="read-aloud-heading" className="text-lg font-medium">
                  Read aloud
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The voice used by the speaker button on answers. It runs on this computer;
                  your choice is saved in this browser.
                </p>
              </div>
              <VoicePreviewButton />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Voice</h3>
              <RadioGroup
                value={voice}
                onValueChange={(value) => {
                  stopReadAloud();
                  setVoicePreferences({ voice: value as VoiceId });
                }}
                className="grid gap-1 sm:grid-cols-2"
              >
                {VOICES.map((option) => (
                  <RadioGroupItem
                    key={option.id}
                    value={option.id}
                    label={option.name}
                    description={`${option.accent} · ${option.gender}`}
                  />
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-medium" id="speed-label">
                  Speed
                </h3>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatSpeed(speed)}
                </span>
              </div>
              <RangeSlider
                aria-label="Reading speed"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={SPEED_STEP}
                value={speed}
                onValueChange={(value) => setVoicePreferences({ speed: value })}
                formatValueText={formatSpeed}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Slower</span>
                <span>Faster</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
