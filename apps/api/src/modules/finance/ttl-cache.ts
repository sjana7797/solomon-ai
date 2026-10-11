/** Tiny in-memory TTL cache that also de-duplicates concurrent loads. */
export class TtlCache {
  private readonly entries = new Map<string, { expires: number; value: Promise<unknown> }>();

  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expires > now) return hit.value as Promise<T>;
    const value = load();
    this.entries.set(key, { expires: now + ttlMs, value });
    // Don't cache failures.
    value.catch(() => this.entries.delete(key));
    if (this.entries.size > 500) {
      for (const [k, e] of this.entries) if (e.expires <= now) this.entries.delete(k);
    }
    return value;
  }
}
