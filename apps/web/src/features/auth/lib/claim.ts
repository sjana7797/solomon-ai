import { AI_API_URL } from "@/lib/env";

import { identityHeaders } from "./auth-client";

/** Move this browser's anonymous chats, uploads, images and memories to the account. */
export async function claimAnonymousData() {
  const res = await fetch(`${AI_API_URL}/api/v1/account/claim`, {
    method: "POST",
    headers: await identityHeaders(),
  });
  if (!res.ok) throw new Error(`Couldn't link this browser's data (${res.status})`);
  return (await res.json()) as Record<"chats" | "documents" | "images" | "memories", number>;
}
