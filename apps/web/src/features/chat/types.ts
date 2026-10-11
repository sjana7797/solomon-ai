import type { QuoteSnapshot } from "@/features/finance";
import type { MemoryChange } from "@/features/memory";

export type Role = "user" | "assistant";

export type MessageStatus = "streaming" | "done" | "error" | "stopped";

export interface Chat {
  id: string;
  title: string;
  model: string;
  /** Uploaded documents this chat answers from (RAG). */
  documentIds?: string[];
  createdAt: number;
  updatedAt: number;
}

export type DocumentStatus = "processing" | "ready" | "failed";

export interface UploadedDocument {
  id: string;
  title: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: DocumentStatus;
  error: string | null;
  chunk_count: number;
}

export interface Message {
  id: string;
  chatId: string;
  role: Role;
  content: string;
  /** Model reasoning, present when deep thinking was on. */
  reasoning?: string;
  /** How long the model reasoned before answering. */
  reasoningMs?: number;
  thinking?: boolean;
  webSearch?: boolean;
  /** Web search progress while the reply is being prepared. */
  searchStage?: SearchStage;
  sources?: Source[];
  images?: ImageResult[];
  /** Live market quotes for securities the message asked about. */
  quotes?: QuoteSnapshot[];
  /** Long-term memory changes learned from the user's message. */
  memoryChanges?: MemoryChange[];
  /** Deep research progress (plan, sub-questions, stage). */
  research?: ResearchProgress;
  /** Image this reply generated (local image model). */
  generatedImage?: GeneratedImageState;
  status: MessageStatus;
  error?: string;
  createdAt: number;
}

export interface Source {
  /** Citation number used as [n] in the answer. */
  index: number;
  /** "document" = the user's uploaded file (no url/domain). */
  kind?: "web" | "document";
  title: string;
  url: string;
  domain: string;
  /** Most relevant passage, for source cards. */
  snippet?: string;
}

export interface ImageResult {
  url: string;
  thumbnail_url: string;
  title: string;
  source_url: string;
  width: number;
  height: number;
}

export interface GeneratedImageState {
  status: "generating" | "complete" | "error";
  prompt: string;
  /** Server image id once stored. */
  id?: string;
  width?: number;
  height?: number;
  /** 0–1 when the model reports steps. */
  progress?: number;
}

export interface ResearchStep {
  id: string;
  question: string;
  status: "pending" | "searching" | "reading" | "done" | "failed";
  /** Distinct sources used for this sub-question. */
  sources: number;
}

export interface ResearchProgress {
  stage: "planning" | "researching" | "reflecting" | "writing";
  round: number;
  steps: ResearchStep[];
}

export type SearchStage = "searching" | "reading";

export interface ModelInfo {
  id: string;
  /** What the model is good for (LiteLLM model info, or a built-in default). */
  description?: string;
  /** Whether the Think toggle (reasoning effort) has an effect. */
  reasoning?: boolean;
}
