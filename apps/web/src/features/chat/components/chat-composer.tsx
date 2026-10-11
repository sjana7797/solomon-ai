"use client";

import { PromptInput } from "@repo/ui/components/agents/prompt-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@repo/ui/components/motion/select";
import { cn } from "@repo/ui/lib/utils";
import {
  BrainIcon,
  CpuIcon,
  GlobeIcon,
  ImageIcon,
  PaperclipIcon,
  TelescopeIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import type { Attachment } from "../hooks/use-attachments";
import { useModels } from "../hooks/use-models";
import { useVoiceInput } from "../hooks/use-voice-input";
import { AttachmentChips } from "./attachment-chips";
import { VoiceInputButton } from "./voice-input-button";

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv";

/** Active tool, shown next to "+"; click to turn it off (ChatGPT-style). */
function ToolChip({
  icon,
  label,
  onRemove,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      disabled={disabled}
      aria-label={`Turn off ${label}`}
      title={`Turn off ${label}`}
      className="group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary/20 pr-2 pl-2.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-primary/35 disabled:opacity-50 [&_svg]:size-3.5"
    >
      {icon}
      {label}
      <XIcon className="opacity-60 transition-opacity group-hover:opacity-100" />
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
      <SelectContent className="right-0 left-auto w-72 shadow-none">
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id} className="py-2">
            <span className="flex min-w-0 items-start gap-2.5">
              <CpuIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-foreground">{model.id}</span>
                  {model.reasoning && (
                    <span
                      title="Supports Think mode"
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/20 px-1.5 py-px text-[10px] font-medium text-accent-foreground"
                    >
                      <BrainIcon className="size-2.5" />
                      Think
                    </span>
                  )}
                </span>
                {model.description && (
                  <span className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
                    {model.description}
                  </span>
                )}
              </span>
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
  researchMode,
  onResearchModeChange,
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
  /** Deep research for the next message (one-shot). */
  researchMode: boolean;
  onResearchModeChange: (researchMode: boolean) => void;
  attachments: Attachment[];
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (attachment: Attachment) => void;
  /** Files still uploading/indexing — sending waits for them. */
  indexing: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  // Spoken text is appended to whatever is already typed, ready to edit.
  const voice = useVoiceInput((text) =>
    setValue((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text)),
  );
  const [waitNote, setWaitNote] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: models, isError } = useModels();
  // Think only applies to reasoning models (unknown → allow).
  const canThink = models?.find((m) => m.id === model)?.reasoning ?? true;

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
            label: "Add files",
            description: "PDF, DOCX, TXT, Markdown or CSV; answers cite them",
            icon: <PaperclipIcon />,
          },
          {
            value: "search",
            label: "Search the web",
            description: "Answer from live web results with sources",
            icon: <GlobeIcon />,
            selected: webSearch,
            groupLabel: "Tools",
          },
          {
            value: "think",
            label: "Think longer",
            description: canThink
              ? "The model reasons before answering"
              : "Not supported by this model; pick one with the Think badge",
            icon: <BrainIcon />,
            selected: thinking && canThink,
            disabled: !canThink,
          },
          {
            value: "research",
            label: "Deep research",
            description: "Searches in rounds and writes a cited report (a few minutes)",
            icon: <TelescopeIcon />,
            selected: researchMode,
          },
          {
            value: "image",
            label: "Create image",
            description: "Generate an image on this Mac",
            icon: <ImageIcon />,
            selected: imageMode,
          },
        ]}
        onAction={(action) => {
          if (action === "upload") fileInput.current?.click();
          else if (action === "search") onWebSearchChange(!webSearch);
          else if (action === "think") onThinkingChange(!thinking);
          else if (action === "research") onResearchModeChange(!researchMode);
          else if (action === "image") onImageModeChange(!imageMode);
        }}
        value={value}
        onValueChange={setValue}
        loading={streaming}
        onStop={onStop}
        disabled={!model}
        autoFocus={autoFocus}
        minRows={1}
        placeholder={
          imageMode
            ? "Describe the image you want…"
            : researchMode
              ? "What should Solomon research in depth?"
              : webSearch
              ? "Search the web and ask anything…"
              : "Ask anything…"
        }
        aria-label="Message"
        className="rounded-[1.75rem] border-border/70 bg-card px-2.5 pt-3 pb-2 shadow-[0_1px_2px_oklch(0_0_0/0.04),0_16px_40px_-20px_oklch(0.45_0.12_292/0.45)] transition-[border-color,box-shadow] focus-within:border-primary/70"
        leadingAction={
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-hide">
            {researchMode && (
              <ToolChip
                icon={<TelescopeIcon />}
                label="Research"
                onRemove={() => onResearchModeChange(false)}
                disabled={streaming}
              />
            )}
            {imageMode && (
              <ToolChip
                icon={<ImageIcon />}
                label="Image"
                onRemove={() => onImageModeChange(false)}
                disabled={streaming}
              />
            )}
            {webSearch && !researchMode && !imageMode && (
              <ToolChip
                icon={<GlobeIcon />}
                label="Search"
                onRemove={() => onWebSearchChange(false)}
                disabled={streaming}
              />
            )}
            {thinking && canThink && !imageMode && (
              <ToolChip
                icon={<BrainIcon />}
                label="Think"
                onRemove={() => onThinkingChange(false)}
                disabled={streaming}
              />
            )}
          </div>
        }
        trailingAction={
          <>
            <VoiceInputButton
              status={voice.status}
              seconds={voice.seconds}
              disabled={streaming}
              onStart={() => void voice.start()}
              onStop={voice.stop}
              onCancel={voice.cancel}
            />
            <ModelSelect value={model} onChange={onModelChange} disabled={streaming} />
          </>
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
      {voice.error && <p className="mt-2 px-1 text-xs text-destructive">{voice.error}</p>}
      {isError && (
        <p className="mt-2 px-1 text-xs text-destructive">
          Couldn&apos;t load models — is the AI service running?
        </p>
      )}
    </div>
  );
}
