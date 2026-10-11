"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useSession } from "@/features/auth/lib/auth-client";
import { useTRPC } from "@/trpc/client";

import { loadAccountKey, useAccountKey } from "../lib/key-store";

export type VaultStatus =
  | "signed-out" // no account: nothing to encrypt for sync
  | "loading"
  | "needs-setup" // signed in, no keys yet
  | "locked" // keys exist, not unlocked on this device
  | "unlocked";

/** Encryption state for the signed-in user on this device. */
export function useVault() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = useSession();
  const userId = session?.user.id;
  const keys = useQuery(trpc.vault.get.queryOptions(undefined, { enabled: Boolean(userId), staleTime: Infinity }));
  const accountKey = useAccountKey(userId);

  useEffect(() => {
    if (userId) void loadAccountKey(userId);
  }, [userId]);

  let status: VaultStatus;
  if (sessionPending) status = "loading";
  else if (!userId) status = "signed-out";
  else if (keys.isPending || accountKey === undefined) status = "loading";
  else if (accountKey) status = "unlocked";
  else if (keys.data === null) status = "needs-setup";
  else status = "locked";

  return {
    status,
    user: session?.user,
    keys: keys.data ?? undefined,
    accountKey: accountKey ?? undefined,
    refresh: () => queryClient.invalidateQueries({ queryKey: trpc.vault.get.queryKey() }),
  };
}
