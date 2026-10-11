export type MemoryCategory = "identity" | "preference" | "interest" | "project" | "other";

export interface MemoryItem {
  id: string;
  content: string;
  category: MemoryCategory;
  source_chat_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryState {
  enabled: boolean;
  memories: MemoryItem[];
}

/** What a reply changed in memory (streamed as a `memory` event). */
export interface MemoryChange {
  op: "add" | "update" | "delete";
  content: string;
}
