import { useSyncExternalStore } from "react";

import {
  ReplyGoneError,
  resumeCompletion,
  stopReply,
  streamCompletion,
  type CompletionEvent,
} from "../api/ai-client";
import { db } from "../db/chat-db";
import type { GeneratedImageState, Message } from "../types";
import {
  appendMessage,
  getMessages,
  updateChat,
  updateMessage,
} from "../db/repository";

/*
 * Streams live outside React so they survive route changes (e.g. `/` → `/c/[id]`
 * after the first message). Deltas are written to IndexedDB and the UI renders
 * them through live queries.
 *
 * Replies are generated server-side (apps/ai chat/runs.py), so the stream is
 * only a view: if the connection drops we reconnect, and after a refresh any
 * reply still marked "streaming" is resumed. Each connection replays the
 * reply from the start, so the message is rebuilt from scratch every time.
 */

const FLUSH_MS = 50;
// Reconnect delays after a dropped stream (the server keeps generating).
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000];
// If a stop request gets no "stopped" event back (e.g. offline), give up after this.
const STOP_FALLBACK_MS = 5_000;

type Active = { controller: AbortController; replyId: string; stopping?: boolean };
const active = new Map<string, Active>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isStreaming(chatId: string) {
  return active.has(chatId);
}

export function useIsStreaming(chatId: string | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => (chatId ? active.has(chatId) : false),
    () => false,
  );
}

export function stopCompletion(chatId: string) {
  const run = active.get(chatId);
  if (!run || run.stopping) return;
  run.stopping = true;
  // The server stops and sends a "stopped" event, which ends the stream.
  void stopReply(run.replyId).catch(() => run.controller.abort());
  setTimeout(() => run.controller.abort(), STOP_FALLBACK_MS);
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Applies one connection's events to the reply, rebuilding it from scratch. */
async function applyEvents(
  chatId: string,
  replyId: string,
  events: AsyncGenerator<CompletionEvent>,
): Promise<"done" | "stopped"> {
  let content = "";
  let reasoning = "";
  let generatedImage: GeneratedImageState | undefined;
  let reasoningStarted: number | undefined;
  let reasoningMs: number | undefined;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => updateMessage(replyId, { content, reasoning, reasoningMs });
  const scheduleFlush = () => {
    flushTimer ??= setTimeout(() => {
      flushTimer = undefined;
      void flush();
    }, FLUSH_MS);
  };

  try {
    for await (const event of events) {
      if (event.type === "status") {
        void updateMessage(replyId, { searchStage: event.stage });
      } else if (event.type === "image") {
        generatedImage = {
          ...generatedImage,
          status: event.status,
          prompt: event.prompt ?? generatedImage?.prompt ?? "",
          ...(event.id && { id: event.id }),
          ...(event.width && { width: event.width, height: event.height }),
          ...(event.progress !== undefined && { progress: event.progress }),
        };
        void updateMessage(replyId, { generatedImage, searchStage: undefined });
      } else if (event.type === "images") {
        void updateMessage(replyId, { images: event.images });
      } else if (event.type === "sources") {
        void updateMessage(replyId, { sources: event.sources, searchStage: undefined });
      } else if (event.type === "research") {
        const { type: _, ...progress } = event;
        void updateMessage(replyId, { research: progress, searchStage: undefined });
      } else if (event.type === "memory") {
        void updateMessage(replyId, { memoryChanges: event.changes });
      } else if (event.type === "quotes") {
        void updateMessage(replyId, { quotes: event.quotes });
      } else if (event.type === "reasoning") {
        reasoningStarted ??= performance.now();
        reasoning += event.content;
        scheduleFlush();
      } else if (event.type === "delta") {
        if (reasoningStarted !== undefined && reasoningMs === undefined) {
          reasoningMs = Math.round(performance.now() - reasoningStarted);
        }
        content += event.content;
        scheduleFlush();
      } else if (event.type === "title") {
        void updateChat(chatId, { title: event.title });
      } else if (event.type === "error") {
        throw new ReplyFailedError(event.message, generatedImage);
      } else if (event.type === "done" || event.type === "stopped") {
        clearTimeout(flushTimer);
        await updateMessage(replyId, {
          content,
          reasoning,
          reasoningMs,
          searchStage: undefined,
          status: event.type === "done" ? "done" : "stopped",
        });
        return event.type;
      }
    }
  } finally {
    clearTimeout(flushTimer);
  }
  // The stream ended without done/stopped: the connection dropped.
  await flush();
  throw new ConnectionLostError();
}

class ReplyFailedError extends Error {
  constructor(
    message: string,
    readonly generatedImage?: GeneratedImageState,
  ) {
    super(message);
  }
}

class ConnectionLostError extends Error {}

/**
 * Follows a reply until it finishes, reconnecting when the connection drops.
 * `connect` opens the first stream; later attempts resume by reply id.
 */
async function follow(
  chatId: string,
  replyId: string,
  connect?: (signal: AbortSignal) => AsyncGenerator<CompletionEvent>,
) {
  if (active.has(chatId)) return;
  const controller = new AbortController();
  active.set(chatId, { controller, replyId });
  emit();

  let attempt = 0;
  try {
    while (true) {
      const events =
        attempt === 0 && connect
          ? connect(controller.signal)
          : resumeCompletion(replyId, controller.signal);
      try {
        await applyEvents(chatId, replyId, events);
        return;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (error instanceof ReplyFailedError || error instanceof ReplyGoneError) throw error;
        // Network error or dropped stream: the server is still generating.
        const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]!;
        attempt += 1;
        if (attempt > 40) throw error; // ~10 minutes of failed reconnects
        await sleep(delay, controller.signal);
        if (controller.signal.aborted) throw error;
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      await updateMessage(replyId, { searchStage: undefined, status: "stopped" });
    } else {
      const generatedImage = error instanceof ReplyFailedError ? error.generatedImage : undefined;
      await updateMessage(replyId, {
        searchStage: undefined,
        ...(generatedImage && { generatedImage: { ...generatedImage, status: "error" as const } }),
        status: "error",
        error: error instanceof Error ? error.message : "Something went wrong",
      });
    }
  } finally {
    active.delete(chatId);
    emit();
  }
}

export async function startCompletion({
  chatId,
  model,
  thinking,
  webSearch,
  image = false,
  research = false,
}: {
  chatId: string;
  model: string;
  thinking: boolean;
  webSearch: boolean;
  image?: boolean;
  research?: boolean;
}) {
  if (active.has(chatId)) return;

  const [chat, stored] = await Promise.all([db.chats.get(chatId), getMessages(chatId)]);
  const history = stored.filter(
    (m) => m.status === "done" || (m.status === "stopped" && m.content),
  );
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  if (!chat || !lastUser) return;

  const replyId = await appendMessage({
    chatId,
    role: "assistant",
    content: "",
    thinking,
    webSearch: webSearch || research,
    searchStage: webSearch && !research ? "searching" : undefined,
    research: research ? { stage: "planning", round: 1, steps: [] } : undefined,
    status: "streaming",
  });

  await follow(chatId, replyId, (signal) =>
    streamCompletion(
      {
        chat_id: chatId,
        user_message_id: lastUser.id,
        assistant_message_id: replyId,
        title: chat.title,
        model,
        thinking,
        web_search: webSearch,
        document_ids: chat.documentIds ?? [],
        image,
        research,
        messages: history.map(({ role, content }) => ({ role, content })),
      },
      signal,
    ),
  );
}

/** Pick up a reply left "streaming" (page refresh, closed tab, crash). */
export function resumeReply(message: Pick<Message, "id" | "chatId">) {
  return follow(message.chatId, message.id);
}

let resumedOnLoad = false;

/** Resume every unfinished reply once per page load. */
export async function resumeUnfinishedReplies() {
  if (resumedOnLoad) return;
  resumedOnLoad = true;
  const unfinished = await db.messages.filter((m) => m.status === "streaming").toArray();
  await Promise.all(unfinished.map((message) => resumeReply(message)));
}
