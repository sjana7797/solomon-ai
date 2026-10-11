import type { QuoteSnapshot } from "@/features/finance";
import type { MemoryChange } from "@/features/memory";
import { AI_API_URL } from "@/lib/env";

import { getClientId } from "../lib/client-id";
import type {
  ImageResult,
  ModelInfo,
  ResearchProgress,
  Role,
  SearchStage,
  Source,
  UploadedDocument,
} from "../types";

// Plain REST/SSE client for the Python AI service (apps/ai).

export type CompletionRequest = {
  chat_id: string;
  /** Last user message — the one being answered. */
  user_message_id: string;
  assistant_message_id: string;
  title: string;
  model: string;
  /** Deep thinking: high reasoning effort, reasoning streamed back. */
  thinking: boolean;
  /** Search the web and answer from the results with citations. */
  web_search: boolean;
  /** Uploaded documents to answer from. */
  document_ids: string[];
  /** Deep research: multi-round search and a long cited report. */
  research: boolean;
  /** Force image generation (otherwise the server detects image requests). */
  image: boolean;
  messages: { role: Role; content: string }[];
  temperature?: number;
  max_tokens?: number;
};

export type CompletionEvent =
  | { type: "delta"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "status"; stage: SearchStage; query?: string; count?: number }
  | { type: "sources"; sources: Source[] }
  | { type: "images"; images: ImageResult[] }
  | { type: "quotes"; quotes: QuoteSnapshot[] }
  /** Long-term memories this message added, updated or removed. */
  | { type: "memory"; changes: MemoryChange[] }
  /** Deep research progress snapshot (replaces the previous one). */
  | ({ type: "research" } & ResearchProgress)
  | {
      type: "image";
      status: "generating" | "complete";
      prompt?: string;
      id?: string;
      width?: number;
      height?: number;
      progress?: number;
    }
  /** AI-generated title, sent once for a new chat. */
  | { type: "title"; title: string }
  | { type: "done" }
  /** The user stopped the reply (it keeps what was generated). */
  | { type: "stopped" }
  | { type: "error"; message: string };

export async function fetchModels(signal?: AbortSignal): Promise<ModelInfo[]> {
  const res = await fetch(`${AI_API_URL}/api/v1/models`, { signal });
  if (!res.ok) throw new Error(`Failed to load models (${res.status})`);
  const data = (await res.json()) as { models: ModelInfo[] };
  return data.models;
}

/** Thrown when a reply can no longer be resumed (expired or never started). */
export class ReplyGoneError extends Error {}

async function* readEvents(res: Response): AsyncGenerator<CompletionEvent> {
  if (res.status === 404) throw new ReplyGoneError("This reply is no longer available.");
  if (!res.ok || !res.body) {
    throw new Error(`AI service responded with ${res.status}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;

    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      // Comment frames (": keep-alive") have no data lines and are skipped.
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) yield JSON.parse(data) as CompletionEvent;
    }
  }
}

/** Start a reply. It's generated server-side, so a dropped stream can be resumed. */
export async function* streamCompletion(
  body: CompletionRequest,
  signal?: AbortSignal,
): AsyncGenerator<CompletionEvent> {
  const res = await fetch(`${AI_API_URL}/api/v1/chat/completion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": getClientId(),
    },
    body: JSON.stringify(body),
    signal,
  });
  yield* readEvents(res);
}

/** Replay a reply's events from the start and follow it live. */
export async function* resumeCompletion(
  replyId: string,
  signal?: AbortSignal,
): AsyncGenerator<CompletionEvent> {
  const res = await fetch(`${AI_API_URL}/api/v1/chat/completion/${replyId}/stream`, {
    headers: { "X-Client-Id": getClientId() },
    signal,
  });
  yield* readEvents(res);
}

/** Ask the server to stop generating a reply (it saves what it has). */
export async function stopReply(replyId: string) {
  await fetch(`${AI_API_URL}/api/v1/chat/completion/${replyId}/stop`, {
    method: "POST",
    headers: { "X-Client-Id": getClientId() },
  });
}

async function errorDetail(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as { detail?: string };
    return body.detail ?? fallback;
  } catch {
    return fallback;
  }
}

/** Upload a file for RAG; it is indexed in the background (poll `fetchDocuments`). */
export async function uploadDocument(file: File): Promise<UploadedDocument> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${AI_API_URL}/api/v1/documents`, {
    method: "POST",
    headers: { "X-Client-Id": getClientId() },
    body,
  });
  if (!res.ok) throw new Error(await errorDetail(res, `Upload failed (${res.status})`));
  return (await res.json()) as UploadedDocument;
}

export async function fetchDocuments(
  ids: string[],
  signal?: AbortSignal,
): Promise<UploadedDocument[]> {
  const params = new URLSearchParams(ids.map((id) => ["ids", id]));
  const res = await fetch(`${AI_API_URL}/api/v1/documents?${params}`, {
    headers: { "X-Client-Id": getClientId() },
    signal,
  });
  if (!res.ok) throw new Error(`Failed to load documents (${res.status})`);
  return ((await res.json()) as { documents: UploadedDocument[] }).documents;
}

/** A generated image as a blob URL (the request carries the owner's client id). */
export async function fetchGeneratedImage(id: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${AI_API_URL}/api/v1/images/${id}`, {
    headers: { "X-Client-Id": getClientId() },
    signal,
  });
  if (!res.ok) throw new Error(`Couldn't load image (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

/** Spoken audio (WAV) for a chunk of answer text, from the local TTS model. */
export async function fetchSpeech(
  text: string,
  options: { voice?: string; speed?: number } = {},
  signal?: AbortSignal,
): Promise<Blob> {
  const res = await fetch(`${AI_API_URL}/api/v1/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...options }),
    signal,
  });
  if (!res.ok) throw new Error(await errorDetail(res, `Read aloud failed (${res.status})`));
  return res.blob();
}

/** Transcribe a 16 kHz mono WAV recording with the local STT model. */
export async function transcribeSpeech(
  wav: Blob,
  signal?: AbortSignal,
): Promise<{ text: string; duration_seconds: number }> {
  const body = new FormData();
  body.append("file", wav, "recording.wav");
  const res = await fetch(`${AI_API_URL}/api/v1/stt`, { method: "POST", body, signal });
  if (!res.ok) throw new Error(await errorDetail(res, `Transcription failed (${res.status})`));
  return (await res.json()) as { text: string; duration_seconds: number };
}
