import { useSyncExternalStore } from "react";

import { DEFAULT_VOICE, SPEED_MAX, SPEED_MIN, VOICES, type VoiceId } from "../voices";

/** Read-aloud voice + speed, saved per browser (localStorage) and shared live. */
export interface VoicePreferences {
  voice: VoiceId;
  speed: number;
}

const STORAGE_KEY = "solomon:voice";
const DEFAULTS: VoicePreferences = { voice: DEFAULT_VOICE, speed: 1 };

let cached: VoicePreferences | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): VoicePreferences {
  try {
    const value = JSON.parse(raw ?? "") as Partial<VoicePreferences>;
    const voice = VOICES.some((v) => v.id === value.voice) ? (value.voice as VoiceId) : DEFAULTS.voice;
    const speed =
      typeof value.speed === "number" ? Math.min(SPEED_MAX, Math.max(SPEED_MIN, value.speed)) : 1;
    return { voice, speed };
  } catch {
    return DEFAULTS;
  }
}

export function getVoicePreferences(): VoicePreferences {
  if (cached) return cached;
  try {
    cached = parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    cached = DEFAULTS;
  }
  return cached;
}

export function setVoicePreferences(next: Partial<VoicePreferences>) {
  cached = { ...getVoicePreferences(), ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // Storage unavailable — keeps working for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keep other tabs in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cached = parse(event.newValue);
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useVoicePreferences(): VoicePreferences {
  return useSyncExternalStore(subscribe, getVoicePreferences, () => DEFAULTS);
}
