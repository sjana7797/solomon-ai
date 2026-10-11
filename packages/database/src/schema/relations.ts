import { defineRelations } from "drizzle-orm";

import * as chat from "./chat";
import * as document from "./document";
import * as image from "./image";

const schema = { ...chat, ...document, ...image };

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
