"use client";

import { Button } from "@repo/ui/components/motion/button";
import { useMutation } from "@tanstack/react-query";
import { LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useTRPC } from "@/trpc/client";

import { useVault } from "../hooks/use-vault";
import { openWithPassphrase, PASSPHRASE_MIN_LENGTH, WrongSecretError, wrapWithPassphrase } from "../lib/crypto";
import { lockAccountKey } from "../lib/key-store";

const input =
  "h-10 w-full rounded-xl border border-border/80 bg-card px-3.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/80";

/** Settings: encryption status, lock this device, change passphrase. */
export function EncryptionSettings() {
  const trpc = useTRPC();
  const router = useRouter();
  const { status, user, keys, refresh } = useVault();
  const setPassphrase = useMutation(trpc.vault.setPassphrase.mutationOptions());
  const [changing, setChanging] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  if (status === "signed-out" || status === "loading" || !user) return null;

  const change = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const current = String(form.get("current") ?? "");
    const next = String(form.get("next") ?? "");
    if (next.length < PASSPHRASE_MIN_LENGTH) {
      setMessage({ ok: false, text: `Use at least ${PASSPHRASE_MIN_LENGTH} characters.` });
      return;
    }
    if (!keys) return;
    setPending(true);
    setMessage(null);
    try {
      const raw = await openWithPassphrase(keys, user.id, current);
      await setPassphrase.mutateAsync(await wrapWithPassphrase(raw, user.id, next));
      await refresh();
      setChanging(false);
      setMessage({ ok: true, text: "Passphrase changed. Use the new one on your other devices." });
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof WrongSecretError ? "Your current passphrase is wrong." : "Couldn't change it. Try again.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="encryption-heading" className="mb-14 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <h2 id="encryption-heading" className="text-lg font-medium">
            Encryption
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Chats are end-to-end encrypted with a key only your devices hold. Your passphrase
            unlocks it on a new device; your recovery key is the backup.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <ShieldCheckIcon className="size-3.5" />
          {status === "unlocked" ? "Unlocked on this device" : "Locked"}
        </span>
      </div>

      {changing ? (
        <form onSubmit={(event) => void change(event)} className="max-w-sm space-y-3">
          <input name="current" type="password" autoComplete="current-password" placeholder="Current passphrase" className={input} />
          <input name="next" type="password" autoComplete="new-password" placeholder={`New passphrase (${PASSPHRASE_MIN_LENGTH}+ characters)`} className={input} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Change passphrase"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setChanging(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setChanging(true)} disabled={!keys}>
            Change passphrase
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await lockAccountKey(user.id);
              router.push("/vault?next=/settings");
            }}
          >
            <LockKeyholeIcon className="size-3.5" />
            Lock this device
          </Button>
        </div>
      )}
      {message && (
        <p className={message.ok ? "text-sm text-emerald-700 dark:text-emerald-300" : "text-sm text-destructive"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
