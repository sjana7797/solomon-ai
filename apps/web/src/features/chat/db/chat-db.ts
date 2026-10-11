import "client-only";

import Dexie, { type EntityTable } from "dexie";

import type { Chat, Message } from "../types";

class ChatDatabase extends Dexie {
  chats!: EntityTable<Chat, "id">;
  messages!: EntityTable<Message, "id">;

  constructor() {
    super("solomon-chat");
    this.version(1).stores({
      chats: "id, updatedAt",
      messages: "id, chatId, [chatId+createdAt]",
    });
  }
}

export const db = new ChatDatabase();
