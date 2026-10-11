import { useSyncExternalStore } from "react";

import { getVoicePreferences } from "@/features/settings/lib/voice-preferences";

import { fetchSpeech } from "../api/ai-client";

/*
 * One read-aloud player for the whole app: starting a message stops any other.
 * The answer is split into short chunks so playback starts after the first
 * chunk is synthesized; the next chunk is fetched while the current one plays.
 */

export type ReadAloudStatus = "idle" | "loading" | "playing";

const CHUNK_CHARS = 500;

let current: { messageId: string; status: ReadAloudStatus } | null = null;
let session: { abort: AbortController; audio: HTMLAudioElement; urls: string[] } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function setStatus(messageId: string, status: ReadAloudStatus) {
  current = status === "idle" ? null : { messageId, status };
  emit();
}

/** Paragraphs, then sentences, packed into chunks of about CHUNK_CHARS. */
export function chunkForSpeech(markdown: string): string[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, " ");
  const sentences = withoutCode
    .split(/\n{2,}/)
    .flatMap((paragraph) => paragraph.match(/[^.!?\n]+[.!?]*\s*/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer && buffer.length + sentence.length > CHUNK_CHARS) {
      chunks.push(buffer);
      buffer = "";
    }
    buffer = buffer ? `${buffer} ${sentence}` : sentence;
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

export function stopReadAloud() {
  if (!session) return;
  session.abort.abort();
  session.audio.pause();
  session.urls.forEach((url) => URL.revokeObjectURL(url));
  const id = current?.messageId;
  session = null;
  if (id) setStatus(id, "idle");
}

export async function startReadAloud(messageId: string, markdown: string) {
  stopReadAloud();
  const chunks = chunkForSpeech(markdown);
  if (chunks.length === 0) return;

  const abort = new AbortController();
  const audio = new Audio();
  const mine = { abort, audio, urls: [] as string[] };
  session = mine;
  setStatus(messageId, "loading");

  // Voice + speed from Settings, fixed for the whole reading.
  const { voice, speed } = getVoicePreferences();
  const load = (i: number) =>
    fetchSpeech(chunks[i]!, { voice, speed }, abort.signal).then((blob) => {
      const url = URL.createObjectURL(blob);
      mine.urls.push(url);
      return url;
    });

  try {
    let next = load(0);
    for (let i = 0; i < chunks.length; i++) {
      const url = await next;
      if (session !== mine) return;
      if (i + 1 < chunks.length) next = load(i + 1); // prefetch while this one plays
      audio.src = url;
      await audio.play();
      setStatus(messageId, "playing");
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Playback failed"));
        abort.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      if (session !== mine) return;
    }
  } catch (error) {
    if (!abort.signal.aborted) console.warn("Read aloud stopped:", error);
  }
  if (session === mine) stopReadAloud();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** This message's read-aloud status. */
export function useReadAloud(messageId: string): ReadAloudStatus {
  return useSyncExternalStore(
    subscribe,
    () => (current?.messageId === messageId ? current.status : "idle"),
    () => "idle",
  );
}
