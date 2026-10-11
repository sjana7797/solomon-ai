import { jwtClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { getClientId } from "@/features/chat/lib/client-id";

export const authClient = createAuthClient({ plugins: [jwtClient()] });

export const { useSession, signIn, signUp, signOut } = authClient;


// Token cache; `token: undefined` remembers "signed out" briefly so anonymous
// requests don't ask the auth server every time.
let cached: { token: string | undefined; expiresAt: number } | undefined;
const SIGNED_OUT_RECHECK_MS = 60_000;

/**
 * Short-lived JWT for the AI service, Nest API and PowerSync (cached until a
 * minute before it expires). Undefined when signed out.
 */
export async function getAccessToken(): Promise<string | undefined> {
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  const { data } = await authClient.token();
  if (!data?.token) {
    cached = { token: undefined, expiresAt: Date.now() + SIGNED_OUT_RECHECK_MS + 60_000 };
    return undefined;
  }
  const payload = JSON.parse(atob(data.token.split(".")[1]!)) as { exp: number };
  cached = { token: data.token, expiresAt: payload.exp * 1000 };
  return data.token;
}

/** Forget the cached token (call after signing in or out). */
export function clearAccessToken() {
  cached = undefined;
}

/** Who's calling: the account token when signed in, plus this browser's id. */
export async function identityHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken().catch(() => undefined);
  return {
    "X-Client-Id": getClientId(),
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}
