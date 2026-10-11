import "client-only";

import Dexie, { type EntityTable } from "dexie";
import { useSyncExternalStore } from "react";

/*
 * Unlocked account keys on this device, as non-extractable CryptoKeys in
 * IndexedDB (so a refresh doesn't ask for the passphrase again, but the key
 * bytes can't be read out). "Lock" deletes it.
 */

class VaultDatabase extends Dexie {
  keys!: EntityTable<{ userId: string; key: CryptoKey }, "userId">;
  constructor() {
    super("solomon-vault");
    this.version(1).stores({ keys: "userId" });
  }
}

const vaultDb = new VaultDatabase();
const memory = new Map<string, CryptoKey | null>(); // null = known locked
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export async function loadAccountKey(userId: string) {
  if (memory.has(userId)) return memory.get(userId) ?? null;
  const row = await vaultDb.keys.get(userId).catch(() => undefined);
  memory.set(userId, row?.key ?? null);
  emit();
  return row?.key ?? null;
}

export async function saveAccountKey(userId: string, key: CryptoKey) {
  memory.set(userId, key);
  emit();
  await vaultDb.keys.put({ userId, key }).catch(() => undefined); // private mode: this tab only
}

export async function lockAccountKey(userId: string) {
  memory.set(userId, null);
  emit();
  await vaultDb.keys.delete(userId).catch(() => undefined);
}

/** undefined while loading, null when locked. */
export function useAccountKey(userId: string | undefined) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (userId ? memory.get(userId) : undefined),
    () => undefined,
  );
}
