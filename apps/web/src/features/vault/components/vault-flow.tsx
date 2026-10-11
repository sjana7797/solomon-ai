"use client";

import { cn } from "@repo/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { KeyRoundIcon, LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { delay, FormError, pill, rise, SubmitButton } from "@/features/auth/components/form-ui";
import { useTRPC } from "@/trpc/client";

import { useVault } from "../hooks/use-vault";
import {
  createVault,
  importAccountKey,
  openWithPassphrase,
  openWithRecoveryKey,
  PASSPHRASE_MIN_LENGTH,
  WrongSecretError,
  wrapWithPassphrase,
  type Bytes,
} from "../lib/crypto";
import { saveAccountKey } from "../lib/key-store";
import { RecoveryKeyCard } from "./recovery-key-card";

function Header({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <span
        className={cn(rise, "grid size-11 place-items-center rounded-full bg-primary/25 text-accent-foreground [&_svg]:size-5")}
        style={delay(0)}
      >
        {icon}
      </span>
      <h1 className={cn(rise, "mt-5 font-display text-[2rem] leading-tight tracking-[-0.01em]")} style={delay(1)}>
        {title}
      </h1>
      <p className={cn(rise, "mt-1.5 text-sm leading-6 text-muted-foreground")} style={delay(2)}>
        {children}
      </p>
    </>
  );
}

function PassphraseFields({ confirm = true, label = "Passphrase" }: { confirm?: boolean; label?: string }) {
  return (
    <>
      <input
        name="passphrase"
        type="password"
        autoComplete="new-password"
        autoFocus
        aria-label={label}
        placeholder={`${label} (${PASSPHRASE_MIN_LENGTH}+ characters)`}
        className={cn(pill, rise)}
        style={delay(3)}
      />
      {confirm && (
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          aria-label="Repeat passphrase"
          placeholder="Repeat it"
          className={cn(pill, rise)}
          style={delay(4)}
        />
      )}
    </>
  );
}

/** Validates the new-passphrase form; returns an error message or the passphrase. */
function readNewPassphrase(form: FormData): { error: string } | { passphrase: string } {
  const passphrase = String(form.get("passphrase") ?? "");
  if (passphrase.length < PASSPHRASE_MIN_LENGTH) {
    return { error: `Use at least ${PASSPHRASE_MIN_LENGTH} characters. A few random words works well.` };
  }
  if (passphrase !== String(form.get("confirm") ?? "")) return { error: "The passphrases don't match." };
  return { passphrase };
}

/**
 * Sets up or unlocks end-to-end encryption for the signed-in user:
 * - first time: choose a passphrase, then save the recovery key (shown once);
 * - on a new device: unlock with the passphrase, or the recovery key and then
 *   choose a new passphrase.
 */
export function VaultFlow() {
  const trpc = useTRPC();
  const router = useRouter();
  const params = useSearchParams();
  const vault = useVault();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/";
  const [step, setStep] = useState<
    "setup" | "recovery-key" | "unlock" | "use-recovery" | "reset-passphrase"
  >("setup");
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [raw, setRaw] = useState<Bytes | null>(null); // account key opened via recovery
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const create = useMutation(trpc.vault.create.mutationOptions());
  const setPassphrase = useMutation(trpc.vault.setPassphrase.mutationOptions());

  const { status, user, keys } = vault;

  useEffect(() => {
    if (status === "signed-out") router.replace(`/sign-in?next=${encodeURIComponent("/vault")}`);
    else if (status === "locked" && step === "setup") setStep("unlock");
    // Already unlocked (and not in the middle of showing the recovery key): done.
    else if (status === "unlocked" && step !== "recovery-key") router.replace(next);
  }, [status, step, router, next]);

  if (status === "loading" || status === "signed-out" || !user) {
    return <div className="h-40" aria-busy="true" />;
  }

  const run = async (work: () => Promise<void>) => {
    setError(null);
    setPending(true);
    try {
      await work();
    } catch (err) {
      setError(
        err instanceof WrongSecretError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Something went wrong. Try again.",
      );
    } finally {
      setPending(false);
    }
  };

  const onSetup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = readNewPassphrase(new FormData(event.currentTarget));
    if ("error" in result) return setError(result.error);
    void run(async () => {
      const created = await createVault(user.id, result.passphrase);
      await create.mutateAsync(created.keys);
      // Saved on the server before the key is shown, so closing the tab here is safe.
      setRecoveryKey(created.recoveryKey);
      setStep("recovery-key");
      await saveAccountKey(user.id, created.accountKey);
      await vault.refresh();
    });
  };

  const onUnlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const passphrase = String(new FormData(event.currentTarget).get("passphrase") ?? "");
    if (!keys || !passphrase) return;
    void run(async () => {
      const opened = await openWithPassphrase(keys, user.id, passphrase);
      await saveAccountKey(user.id, await importAccountKey(opened));
    });
  };

  const onRecovery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get("recovery") ?? "");
    if (!keys || !text.trim()) return;
    void run(async () => {
      setRaw(await openWithRecoveryKey(keys, user.id, text));
      setStep("reset-passphrase");
    });
  };

  const onReset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = readNewPassphrase(new FormData(event.currentTarget));
    if ("error" in result) return setError(result.error);
    if (!raw) return;
    void run(async () => {
      await setPassphrase.mutateAsync(await wrapWithPassphrase(raw, user.id, result.passphrase));
      await vault.refresh();
      await saveAccountKey(user.id, await importAccountKey(raw));
      setRaw(null);
    });
  };

  const form = "mt-8 w-full space-y-3 text-left";

  return (
    <div className="flex w-full max-w-[22rem] flex-col items-center text-center">
      {step === "setup" && (
        <>
          <Header icon={<ShieldCheckIcon />} title="Protect your chats">
            Your chats are encrypted on this device before they sync. Choose a passphrase to unlock
            them on your other devices. We can&apos;t see it or reset it.
          </Header>
          <form key="setup" onSubmit={onSetup} className={form} noValidate>
            <PassphraseFields />
            {error && <FormError>{error}</FormError>}
            <SubmitButton pending={pending} pendingLabel="Creating your keys…" step={5}>
              Continue
            </SubmitButton>
          </form>
        </>
      )}

      {step === "recovery-key" && recoveryKey && (
        <>
          <Header icon={<KeyRoundIcon />} title="Save your recovery key">
            If you forget your passphrase, this key is the only way back into your chats. Store it
            in a password manager or print it. It won&apos;t be shown again.
          </Header>
          <div className="mt-8 w-full space-y-4 text-left">
            <RecoveryKeyCard recoveryKey={recoveryKey} email={user.email} />
            <label className={cn(rise, "flex items-start gap-2.5 px-1 text-sm")} style={delay(4)}>
              <input
                type="checkbox"
                checked={saved}
                onChange={(event) => setSaved(event.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>I&apos;ve saved my recovery key somewhere safe.</span>
            </label>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setRecoveryKey(null);
                router.replace(next);
              }}
            >
              <SubmitButton disabled={!saved} step={5}>
                Finish
              </SubmitButton>
            </form>
          </div>
        </>
      )}

      {step === "unlock" && (
        <>
          <Header icon={<LockKeyholeIcon />} title="Unlock your chats">
            Enter your passphrase to decrypt your chats on this device.
          </Header>
          <form key="unlock" onSubmit={onUnlock} className={form} noValidate>
            <input
              name="passphrase"
              type="password"
              autoComplete="current-password"
              autoFocus
              aria-label="Passphrase"
              placeholder="Passphrase"
              className={cn(pill, rise)}
              style={delay(3)}
            />
            {error && <FormError>{error}</FormError>}
            <SubmitButton pending={pending} pendingLabel="Unlocking…">
              Unlock
            </SubmitButton>
          </form>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep("use-recovery");
            }}
            className={cn(rise, "mt-6 text-sm text-muted-foreground hover:text-foreground")}
            style={delay(5)}
          >
            Forgot it? Use your recovery key
          </button>
        </>
      )}

      {step === "use-recovery" && (
        <>
          <Header icon={<KeyRoundIcon />} title="Use your recovery key">
            Enter the recovery key you saved when you set up encryption. Dashes and spaces are
            optional.
          </Header>
          <form key="recovery" onSubmit={onRecovery} className={form} noValidate>
            <textarea
              name="recovery"
              autoFocus
              rows={3}
              spellCheck={false}
              aria-label="Recovery key"
              placeholder="XXXX-XXXX-XXXX-…"
              className={cn(
                rise,
                "w-full resize-none rounded-2xl border border-border/80 bg-card px-4 py-3 font-mono text-sm tracking-wider outline-none placeholder:text-muted-foreground/60 focus:border-primary/80",
              )}
              style={delay(3)}
            />
            {error && <FormError>{error}</FormError>}
            <SubmitButton pending={pending} pendingLabel="Checking…">
              Continue
            </SubmitButton>
          </form>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep("unlock");
            }}
            className={cn(rise, "mt-6 text-sm text-muted-foreground hover:text-foreground")}
            style={delay(5)}
          >
            Back to passphrase
          </button>
        </>
      )}

      {step === "reset-passphrase" && (
        <>
          <Header icon={<ShieldCheckIcon />} title="Choose a new passphrase">
            Your recovery key worked. Set a new passphrase for unlocking on your devices; your
            recovery key stays the same.
          </Header>
          <form key="reset" onSubmit={onReset} className={form} noValidate>
            <PassphraseFields label="New passphrase" />
            {error && <FormError>{error}</FormError>}
            <SubmitButton pending={pending} pendingLabel="Saving…" step={5}>
              Save and unlock
            </SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}
