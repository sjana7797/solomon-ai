import { AI_API_URL } from "@/lib/env";

import { identityHeaders } from "@/features/auth/lib/auth-client";

import type { MemoryState } from "./types";

// Memory lives in the AI service (REST, like the rest of the AI APIs).
const BASE = `${AI_API_URL}/api/v1/memory`;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(await identityHeaders()),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Memory service responded with ${res.status}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const memoryApi = {
  get: () => request<MemoryState>(""),
  setEnabled: (enabled: boolean) =>
    request<{ enabled: boolean }>("/settings", { method: "PUT", body: JSON.stringify({ enabled }) }),
  remove: (id: string) => request<void>(`/${id}`, { method: "DELETE" }),
  clear: () => request<{ deleted: number }>("", { method: "DELETE" }),
};
