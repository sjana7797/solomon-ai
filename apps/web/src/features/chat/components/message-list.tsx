"use client";

import { MessageScroller } from "@repo/ui/components/agents/message";

import type { Message } from "../types";
import { MessageItem } from "./message-item";

export function MessageList({
  messages,
  streaming,
  onRetry,
}: {
  messages: Message[];
  streaming: boolean;
  onRetry: (message: Message) => void;
}) {
  return (
    <MessageScroller
      busy={streaming}
      // Tick rail on the side to jump between turns (shows once the chat overflows).
      navigation="rail"
      navigationLabel="Jump to message"
      className="min-h-0 flex-1"
      contentClassName="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8"
    >
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          interrupted={message.status === "streaming" && !streaming}
          onRetry={() => onRetry(message)}
        />
      ))}
    </MessageScroller>
  );
}
