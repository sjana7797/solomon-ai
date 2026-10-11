import { defineRelations } from "drizzle-orm";

import * as auth from "./auth";
import * as chat from "./chat";
import * as document from "./document";
import * as image from "./image";
import * as keys from "./keys";
import * as memory from "./memory";

const schema = { ...auth, ...chat, ...document, ...image, ...keys, ...memory };

export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session(),
    accounts: r.many.account(),
  },
  session: {
    user: r.one.user({ from: r.session.userId, to: r.user.id }),
  },
  account: {
    user: r.one.user({ from: r.account.userId, to: r.user.id }),
  },
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
