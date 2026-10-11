const STORAGE_KEY = "solomon:client-id";

let cached: string | undefined;

/**
 * Anonymous, per-browser id that owns this browser's chats on the server
 * until real auth exists. Falls back to an in-memory id if storage is blocked.
 */
export function getClientId() {
  if (cached) return cached;
  try {
    cached = localStorage.getItem(STORAGE_KEY) ?? undefined;
    if (!cached) {
      cached = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, cached);
    }
  } catch {
    cached ??= crypto.randomUUID();
  }
  return cached;
}
