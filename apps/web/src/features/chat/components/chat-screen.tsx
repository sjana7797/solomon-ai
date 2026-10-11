"use client";

import { Button } from "@repo/ui/components/motion/button";
import { AnimatedSidebarTrigger } from "@repo/ui/components/motion/animated-sidebar";
import { PanelLeftIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useRetry, useSendMessage, useSetChatModel } from "../hooks/use-chat-actions";
import { useAttachments } from "../hooks/use-attachments";
import { useChat, useMessages } from "../hooks/use-chats";
import { usePreferredModel } from "../hooks/use-models";
import { useThinking, useWebSearch } from "../hooks/use-toggle-preference";
import { stopCompletion, useIsStreaming } from "../lib/stream-manager";
import { ChatComposer } from "./chat-composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { SourcesPanelProvider } from "./sources-panel";

export function ChatScreen({ chatId }: { chatId?: string }) {
  const chat = useChat(chatId);
  const messages = useMessages(chatId);
  const streaming = useIsStreaming(chatId);
  const [preferredModel, setPreferredModel] = usePreferredModel();
  const [thinking, setThinking] = useThinking();
  const [webSearch, setWebSearch] = useWebSearch();
  const files = useAttachments(chat);
  // One-shot: image mode applies to the next message only.
  const [imageMode, setImageMode] = useState(false);
  const send = useSendMessage();
  const retry = useRetry();
  const setChatModel = useSetChatModel();
  const router = useRouter();

  const model = chat?.model ?? preferredModel;

  const changeModel = (next: string) => {
    setPreferredModel(next);
    if (chatId) void setChatModel(chatId, next);
  };

  const handleSend = (text: string) => {
    if (!model) return;
    void send({
      chatId,
      text,
      model,
      thinking,
      webSearch,
      documentIds: files.takePending(),
      image: imageMode,
    });
    setImageMode(false);
  };

  if (chatId && chat === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium">This chat doesn&apos;t exist on this device.</p>
        <Button variant="secondary" size="sm" onClick={() => router.push("/")}>
          Start a new chat
        </Button>
      </div>
    );
  }

  const composer = (
    <ChatComposer
      onSend={handleSend}
      onStop={() => chatId && stopCompletion(chatId)}
      streaming={streaming}
      model={model}
      onModelChange={changeModel}
      thinking={thinking}
      onThinkingChange={setThinking}
      webSearch={webSearch}
      onWebSearchChange={setWebSearch}
      imageMode={imageMode}
      onImageModeChange={setImageMode}
      attachments={files.attachments}
      onAttachFiles={(list) => void files.addFiles(list)}
      onRemoveAttachment={files.remove}
      indexing={files.indexing}
      autoFocus
    />
  );

  return (
    <SourcesPanelProvider>
      <header className="flex h-14 shrink-0 items-center gap-2 px-3">
        <AnimatedSidebarTrigger className="size-8 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <PanelLeftIcon className="size-4" />
        </AnimatedSidebarTrigger>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
          {chat?.title ?? "New chat"}
        </h2>
      </header>

      {!chatId || (messages && messages.length === 0) ? (
        <EmptyState onPick={handleSend}>{composer}</EmptyState>
      ) : (
        <>
          <MessageList
            messages={messages ?? []}
            streaming={streaming}
            onRetry={(message) =>
              model &&
              chatId &&
              void retry({
                chatId,
                failedMessageId: message.id,
                model,
                thinking: message.thinking ?? thinking,
                webSearch: message.webSearch ?? webSearch,
              })
            }
          />
          {/* Docked composer: replies fade out beneath it instead of being cut off. */}
          <div className="relative mx-auto w-full max-w-3xl px-4 pb-4 before:pointer-events-none before:absolute before:inset-x-0 before:-top-10 before:h-10 before:bg-linear-to-t before:from-background before:to-transparent">
            {composer}
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Solomon can make mistakes. Check important info.
            </p>
          </div>
        </>
      )}
    </SourcesPanelProvider>
  );
}
