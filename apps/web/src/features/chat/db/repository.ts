import Dexie from "dexie";

import type { Chat, Message } from "../types";
import { db } from "./chat-db";

let lastTimestamp = 0;

/** Strictly increasing ms timestamp, so messages created together keep their order. */
function now() {
  const t = Date.now();
  lastTimestamp = t > lastTimestamp ? t : lastTimestamp + 1;
  return lastTimestamp;
}

export function makeTitle(text: string) {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 48 ? `${line.slice(0, 48).trimEnd()}…` : line || "New chat";
}

export async function createChat(input: Pick<Chat, "title" | "model" | "documentIds">) {
  const t = now();
  const id = crypto.randomUUID();
  await db.chats.add({ id, ...input, createdAt: t, updatedAt: t });
  return id;
}

export function updateChat(id: string, changes: Partial<Omit<Chat, "id">>) {
  return db.chats.update(id, { ...changes, updatedAt: now() });
}

export function deleteChat(id: string) {
  return db.transaction("rw", db.chats, db.messages, async () => {
    await db.messages.where("chatId").equals(id).delete();
    await db.chats.delete(id);
  });
}

export async function appendMessage(
  input: Omit<Message, "id" | "createdAt">,
) {
  const id = crypto.randomUUID();
  await db.messages.add({ id, ...input, createdAt: now() });
  await db.chats.update(input.chatId, { updatedAt: now() });
  return id;
}

export function updateMessage(id: string, changes: Partial<Omit<Message, "id">>) {
  return db.messages.update(id, changes);
}

export function deleteMessage(id: string) {
  return db.messages.delete(id);
}

export function getMessages(chatId: string) {
  return db.messages
    .where("[chatId+createdAt]")
    .between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
    .toArray();
}
