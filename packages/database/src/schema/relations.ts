import { defineRelations } from "drizzle-orm";

import * as chat from "./chat";
import * as document from "./document";
import * as image from "./image";
import * as memory from "./memory";

const schema = { ...chat, ...document, ...image, ...memory };

export const relations = defineRelations(schema, (r) => ({
  chats: {
    messages: r.many.messages(),
  },
  messages: {
    chat: r.one.chats({
      from: r.messages.chatId,
      to: r.chats.id,
    }),
  },
  memoryProfiles: {
    memories: r.many.memories(),
  },
  memories: {
    profile: r.one.memoryProfiles({
      from: r.memories.ownerId,
      to: r.memoryProfiles.ownerId,
    }),
  },
  documents: {
    chunks: r.many.chunks(),
  },
  chunks: {
    document: r.one.documents({
      from: r.chunks.documentId,
      to: r.documents.id,
    }),
  },
}));
