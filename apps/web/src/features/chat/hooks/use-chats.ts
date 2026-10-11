"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { db } from "../db/chat-db";
import { getMessages } from "../db/repository";

export function useChats() {
  return useLiveQuery(() => db.chats.orderBy("updatedAt").reverse().toArray(), []);
}

/** `undefined` while loading, `null` when the chat doesn't exist. */
export function useChat(chatId: string | undefined) {
  return useLiveQuery(
    async () => (chatId ? ((await db.chats.get(chatId)) ?? null) : null),
    [chatId],
  );
}

export function useMessages(chatId: string | undefined) {
  return useLiveQuery(
    () => (chatId ? getMessages(chatId) : []),
    [chatId],
  );
}
