"use client";

import {
  Message,
  MessageAvatar,
  MessageBubble,
  MessageBubbleContent,
  MessageContent,
} from "@repo/ui/components/agents/message";
import { ReasoningText } from "@repo/ui/components/agents/loading-states/reasoning-text";
import { ThinkingShimmer } from "@repo/ui/components/agents/loading-states/thinking-shimmer";
import { StreamingResponse } from "@repo/ui/components/agents/streaming-response";
import { SparklesIcon } from "lucide-react";
import { memo } from "react";

import type { Message as ChatMessage } from "../types";
import { GeneratedImage } from "./generated-image";
import { ImageStrip } from "./image-strip";
import { Markdown } from "./markdown";
import { ReadAloudButton } from "./read-aloud-button";
import { SourceStrip } from "./source-strip";
import { useSourcesPanel } from "./sources-panel";
import { ThinkingBlock } from "./thinking-block";

export const MessageItem = memo(function MessageItem({
  message,
  interrupted,
  onRetry,
}: {
  message: ChatMessage;
  /** Stream ended without finishing (e.g. page reload mid-reply). */
  interrupted: boolean;
  onRetry: () => void;
}) {
  const openSources = useSourcesPanel();

  if (message.role === "user") {
    return (
      <Message from="user" animateIn>
        <MessageContent>
          {/* The bubble surface uses --muted; tint it with the pastel user color. */}
          <MessageBubble
            variant="soft"
            className="[--muted:var(--bubble-user)] [&_[data-slot]]:text-bubble-user-foreground"
          >
            <MessageBubbleContent className="text-[0.95rem] whitespace-pre-wrap text-bubble-user-foreground">
              {message.content}
            </MessageBubbleContent>
          </MessageBubble>
        </MessageContent>
      </Message>
    );
  }

  const streaming = message.status === "streaming" && !interrupted;
  const failed = message.status === "error";
  const searching = streaming && message.searchStage !== undefined;

  return (
    <Message from="assistant" className="gap-3">
      <MessageAvatar className="bg-primary/70 text-primary-foreground">
        <SparklesIcon />
      </MessageAvatar>
      <MessageContent className="pt-0.5">
        <StreamingResponse
          status={streaming ? "streaming" : failed ? "error" : "complete"}
          copyText={message.content || undefined}
          extraActions={
            message.content && !message.generatedImage ? (
              <ReadAloudButton messageId={message.id} text={message.content} />
            ) : null
          }
          onRetry={failed ? onRetry : undefined}
          // Fenced code renders through CodeBlock, so drop StreamingResponse's own <pre> styling.
          contentClassName="text-[0.95rem] leading-7 [&_pre]:my-0 [&_pre]:overflow-visible [&_pre]:rounded-none [&_pre]:border-0 [&_pre]:bg-transparent [&_pre]:p-0"
        >
          {searching && (
            <div className="mb-3">
              <ReasoningText
                key={message.searchStage}
                phrases={
                  message.searchStage === "searching"
                    ? ["Searching the web"]
                    : ["Reading sources", "Finding relevant passages"]
                }
                variant="swap"
              />
            </div>
          )}
          {message.sources && message.sources.length > 0 && (
            <SourceStrip sources={message.sources} />
          )}
          {message.images && message.images.length > 0 && (
            <ImageStrip images={message.images} />
          )}
          {message.thinking && !searching && (message.reasoning || streaming) && (
            <ThinkingBlock
              reasoning={message.reasoning ?? ""}
              reasoningMs={message.reasoningMs}
              active={streaming && !message.content}
            />
          )}
          {message.generatedImage && (
            <GeneratedImage
              image={message.generatedImage}
              onRetry={failed ? onRetry : undefined}
            />
          )}
          {message.generatedImage ? null : streaming && !message.content ? (
            message.thinking || searching ? null : <ThinkingShimmer />
          ) : (
            <Markdown
              streaming={streaming}
              citations={message.sources}
              onCitationClick={(n) => message.sources && openSources(message.sources, n)}
            >
              {message.content}
            </Markdown>
          )}
          {failed && (
            <p className="mt-2 text-sm text-destructive">
              {message.error ?? "Something went wrong."}
            </p>
          )}
          {(message.status === "stopped" || interrupted) && (
            <p className="mt-2 text-xs text-muted-foreground">Stopped</p>
          )}
        </StreamingResponse>
      </MessageContent>
    </Message>
  );
});
