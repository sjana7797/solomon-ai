"use client";

import { PromptInput } from "@repo/ui/components/agents/prompt-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@repo/ui/components/motion/select";
import { cn } from "@repo/ui/lib/utils";
import { BrainIcon, CpuIcon, GlobeIcon, ImageIcon, PaperclipIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import type { Attachment } from "../hooks/use-attachments";
import { useModels } from "../hooks/use-models";
import { AttachmentChips } from "./attachment-chips";

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv";

function ModeToggle({
  pressed,
  onPressedChange,
  disabled,
  icon,
  title,
  children,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  disabled?: boolean;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-200 ease-out hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5",
        pressed &&
          "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.08),0_2px_8px_-4px_oklch(0.45_0.12_292/0.4)] [&_svg]:text-primary-foreground dark:[&_svg]:text-primary",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ModelSelect({
  value,
  onChange,
  disabled,
}: {
  value: string | undefined;
  onChange: (model: string) => void;
  disabled?: boolean;
}) {
  const { data: models } = useModels();
  if (!models?.length) return null;

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled} className="min-w-0">
      <SelectTrigger className="h-8 w-auto max-w-44 rounded-xl border-0 bg-transparent px-2 py-0 text-xs hover:bg-muted focus-visible:ring-2">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <CpuIcon className="size-3.5 shrink-0" />
          <span className="truncate">{value ?? "Choose model"}</span>
        </span>
      </SelectTrigger>
      <SelectContent className="right-0 left-auto w-52 shadow-none">
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id} className="py-2">
            <span className="flex min-w-0 items-center gap-2">
              <CpuIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-sm text-foreground">{model.id}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ChatComposer({
  onSend,
  onStop,
  streaming,
  model,
  onModelChange,
  thinking,
  onThinkingChange,
  webSearch,
  onWebSearchChange,
  imageMode,
  onImageModeChange,
  attachments,
  onAttachFiles,
  onRemoveAttachment,
  indexing,
  autoFocus,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  model: string | undefined;
  onModelChange: (model: string) => void;
  thinking: boolean;
  onThinkingChange: (thinking: boolean) => void;
  webSearch: boolean;
  onWebSearchChange: (webSearch: boolean) => void;
  /** Generate an image from the next message (one-shot). */
  imageMode: boolean;
  onImageModeChange: (imageMode: boolean) => void;
  attachments: Attachment[];
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (attachment: Attachment) => void;
  /** Files still uploading/indexing — sending waits for them. */
  indexing: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [waitNote, setWaitNote] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { isError } = useModels();

  return (
    <div>
      <AttachmentChips attachments={attachments} onRemove={onRemoveAttachment} />
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) onAttachFiles(files);
          event.target.value = "";
        }}
      />
      <PromptInput
        actions={[
          {
            value: "upload",
            label: "Upload files",
            description: "PDF, DOCX, TXT, Markdown or CSV — answers cite them",
            icon: <PaperclipIcon />,
          },
        ]}
        onAction={(action) => {
          if (action === "upload") fileInput.current?.click();
        }}
        value={value}
        onValueChange={setValue}
        loading={streaming}
        onStop={onStop}
        disabled={!model}
        autoFocus={autoFocus}
        minRows={2}
        placeholder={
          imageMode
            ? "Describe the image you want…"
            : webSearch
              ? "Search the web and ask anything…"
              : "Ask anything…"
        }
        aria-label="Message"
        className="rounded-[1.75rem] border-border/70 bg-card px-3 pt-3 pb-2.5 shadow-[0_1px_2px_oklch(0_0_0/0.04),0_16px_40px_-20px_oklch(0.45_0.12_292/0.45)] transition-[border-color,box-shadow] focus-within:border-primary/70"
        leadingAction={
          <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5">
            <ModeToggle
              pressed={webSearch}
              onPressedChange={onWebSearchChange}
              disabled={streaming}
              icon={<GlobeIcon />}
              title="Search the web and answer with cited sources"
            >
              Search
            </ModeToggle>
            <ModeToggle
              pressed={thinking}
              onPressedChange={onThinkingChange}
              disabled={streaming}
              icon={<BrainIcon />}
              title="Deep thinking: the model reasons longer before answering"
            >
              Think
            </ModeToggle>
            <ModeToggle
              pressed={imageMode}
              onPressedChange={onImageModeChange}
              disabled={streaming}
              icon={<ImageIcon />}
              title="Generate an image from your message (runs locally)"
            >
              Image
            </ModeToggle>
          </div>
        }
        trailingAction={
          <ModelSelect value={model} onChange={onModelChange} disabled={streaming} />
        }
        submitClassName="size-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground"
        onSubmit={(text) => {
          const trimmed = text.trim();
          if (!trimmed) return;
          if (indexing) {
            setWaitNote(true);
            return;
          }
          setWaitNote(false);
          onSend(trimmed);
          setValue("");
        }}
      />
      {waitNote && indexing && (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          Your files are still being indexed — send again in a moment.
        </p>
      )}
      {isError && (
        <p className="mt-2 px-1 text-xs text-destructive">
          Couldn&apos;t load models — is the AI service running?
        </p>
      )}
    </div>
  );
}
