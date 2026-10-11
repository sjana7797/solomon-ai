import { useSyncExternalStore } from "react";

import { streamCompletion } from "../api/ai-client";
import { db } from "../db/chat-db";
import type { GeneratedImageState } from "../types";
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
 */

const FLUSH_MS = 50;
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isStreaming(chatId: string) {
  return controllers.has(chatId);
}

export function useIsStreaming(chatId: string | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => (chatId ? controllers.has(chatId) : false),
    () => false,
  );
}

export function stopCompletion(chatId: string) {
  controllers.get(chatId)?.abort();
}

export async function startCompletion({
  chatId,
  model,
  thinking,
  webSearch,
  image = false,
}: {
  chatId: string;
  model: string;
  thinking: boolean;
  webSearch: boolean;
  image?: boolean;
}) {
  if (controllers.has(chatId)) return;
  const controller = new AbortController();
  controllers.set(chatId, controller);
  emit();

  const [chat, stored] = await Promise.all([db.chats.get(chatId), getMessages(chatId)]);
  const history = stored.filter(
    (m) => m.status === "done" || (m.status === "stopped" && m.content),
  );
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  if (!chat || !lastUser) {
    controllers.delete(chatId);
    emit();
    return;
  }

  const assistantId = await appendMessage({
    chatId,
    role: "assistant",
    content: "",
    thinking,
    webSearch,
    searchStage: webSearch ? "searching" : undefined,
    status: "streaming",
  });

  let content = "";
  let reasoning = "";
  let generatedImage: GeneratedImageState | undefined;
  let reasoningStarted: number | undefined;
  let reasoningMs: number | undefined;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleFlush = () => {
    flushTimer ??= setTimeout(() => {
      flushTimer = undefined;
      void updateMessage(assistantId, { content, reasoning, reasoningMs });
    }, FLUSH_MS);
  };

  try {
    for await (const event of streamCompletion(
      {
        chat_id: chatId,
        user_message_id: lastUser.id,
        assistant_message_id: assistantId,
        title: chat.title,
        model,
        thinking,
        web_search: webSearch,
        document_ids: chat.documentIds ?? [],
        image,
        messages: history.map(({ role, content }) => ({ role, content })),
      },
      controller.signal,
    )) {
      if (event.type === "status") {
        void updateMessage(assistantId, { searchStage: event.stage });
      } else if (event.type === "image") {
        generatedImage = {
          ...generatedImage,
          status: event.status,
          prompt: event.prompt ?? generatedImage?.prompt ?? "",
          ...(event.id && { id: event.id }),
          ...(event.width && { width: event.width, height: event.height }),
          ...(event.progress !== undefined && { progress: event.progress }),
        };
        void updateMessage(assistantId, { generatedImage, searchStage: undefined });
      } else if (event.type === "images") {
        void updateMessage(assistantId, { images: event.images });
      } else if (event.type === "sources") {
        void updateMessage(assistantId, { sources: event.sources, searchStage: undefined });
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
        throw new Error(event.message);
      }
    }
    clearTimeout(flushTimer);
    await updateMessage(assistantId, {
      content,
      reasoning,
      reasoningMs,
      searchStage: undefined,
      status: "done",
    });
  } catch (error) {
    clearTimeout(flushTimer);
    if (controller.signal.aborted) {
      await updateMessage(assistantId, {
        content,
        reasoning,
        reasoningMs,
        searchStage: undefined,
        status: "stopped",
      });
    } else {
      await updateMessage(assistantId, {
        content,
        reasoning,
        reasoningMs,
        searchStage: undefined,
        ...(generatedImage && { generatedImage: { ...generatedImage, status: "error" as const } }),
        status: "error",
        error: error instanceof Error ? error.message : "Something went wrong",
      });
    }
  } finally {
    controllers.delete(chatId);
    emit();
  }
}
