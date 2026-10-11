"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { db } from "../db/chat-db";

import {
  appendMessage,
  createChat,
  deleteChat,
  deleteMessage,
  makeTitle,
  updateChat,
} from "../db/repository";
import { startCompletion, stopCompletion } from "../lib/stream-manager";

export function useSendMessage() {
  const router = useRouter();

  return useCallback(
    async ({
      chatId,
      text,
      model,
      thinking,
      webSearch,
      documentIds = [],
      image = false,
    }: {
      chatId?: string;
      text: string;
      model: string;
      thinking: boolean;
      webSearch: boolean;
      /** Files attached in the composer; added to the chat's documents. */
      documentIds?: string[];
      /** Force image generation for this message. */
      image?: boolean;
    }) => {
      let id = chatId;
      if (!id) {
        id = await createChat({ title: makeTitle(text), model, documentIds });
        router.push(`/c/${id}`);
      }
      else if (documentIds.length) {
        const chat = await db.chats.get(id);
        const merged = [...new Set([...(chat?.documentIds ?? []), ...documentIds])];
        await updateChat(id, { documentIds: merged });
      }
      await appendMessage({ chatId: id, role: "user", content: text, status: "done" });
      void startCompletion({ chatId: id, model, thinking, webSearch, image });
    },
    [router],
  );
}

export function useRetry() {
  return useCallback(
    async ({
      chatId,
      failedMessageId,
      model,
      thinking,
      webSearch,
    }: {
      chatId: string;
      failedMessageId: string;
      model: string;
      thinking: boolean;
      webSearch: boolean;
    }) => {
      await deleteMessage(failedMessageId);
      void startCompletion({ chatId, model, thinking, webSearch });
    },
    [],
  );
}

export function useDeleteChat() {
  const router = useRouter();

  return useCallback(
    async (chatId: string, isActive: boolean) => {
      stopCompletion(chatId);
      await deleteChat(chatId);
      if (isActive) router.push("/");
    },
    [router],
  );
}

export function useSetChatModel() {
  return useCallback(
    (chatId: string, model: string) => updateChat(chatId, { model }),
    [],
  );
}
