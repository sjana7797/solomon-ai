"use client";

import { cn } from "@repo/ui/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, LoaderIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { BrandMark } from "@/features/chat/components/brand-mark";

import { clearAccessToken, signIn, signUp } from "../lib/auth-client";
import { claimAnonymousData } from "../lib/claim";
import { delay, pill, rise } from "./form-ui";

type Mode = "sign-in" | "sign-up";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email first, then password (and name when creating an account). */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"email" | "details">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/";
  const signingUp = mode === "sign-up";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (step === "email") {
      if (!EMAIL.test(email.trim())) {
        setError("Enter a valid email address.");
        return;
      }
      setStep("details");
      requestAnimationFrame(() => passwordRef.current?.focus());
      return;
    }
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    setPending(true);
    const { error } = signingUp
      ? await signUp.email({
          email: email.trim(),
          password,
          name: String(form.get("name") ?? "").trim() || email.split("@")[0]!,
        })
      : await signIn.email({ email: email.trim(), password });
    if (error) {
      setPending(false);
      setError(error.message ?? "Something went wrong. Try again.");
      return;
    }
    clearAccessToken();
    // Chats, files and memories made before signing in now belong to the account.
    await claimAnonymousData().catch(() => undefined);
    await queryClient.invalidateQueries();
    router.replace(next);
    router.refresh();
  };

  const otherHref = `${signingUp ? "/sign-in" : "/sign-up"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="flex w-full max-w-[21rem] flex-col items-center text-center">
      <Link href="/" aria-label="Solomon home" className={rise} style={delay(0)}>
        <BrandMark className="size-11 transition-transform duration-500 ease-out hover:rotate-12" />
      </Link>
      <h1
        className={cn(rise, "mt-5 font-display text-[2rem] leading-tight tracking-[-0.01em]")}
        style={delay(1)}
      >
        {signingUp ? "Create your account" : "Log into your account"}
      </h1>
      <p className={cn(rise, "mt-1.5 text-sm text-muted-foreground")} style={delay(2)}>
        {signingUp
          ? "Your chats, memory and research, on every device."
          : "Pick up right where you left off."}
      </p>

      <form onSubmit={(event) => void submit(event)} className="mt-8 w-full space-y-3 text-left" noValidate>
        {step === "email" ? (
          <input
            key="email"
            style={delay(3)}
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            aria-label="Email"
            placeholder="e.g., name@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={cn(pill, rise)}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
              className="flex h-11 w-full animate-rise items-center gap-2 rounded-full bg-muted px-4 motion-reduce:animate-none text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4 shrink-0" />
              <span className="truncate">{email.trim()}</span>
            </button>
            {signingUp && (
              <input
                name="name"
                autoComplete="name"
                aria-label="Name"
                placeholder="Your name"
                className={cn(pill, rise)}
                style={delay(0)}
              />
            )}
            <input
              ref={passwordRef}
              name="password"
              type="password"
              required
              minLength={signingUp ? 10 : undefined}
              autoComplete={signingUp ? "new-password" : "current-password"}
              aria-label="Password"
              placeholder={signingUp ? "Choose a password (10+ characters)" : "Password"}
              className={cn(pill, rise)}
              style={delay(signingUp ? 1 : 0)}
            />
          </>
        )}

        {error && (
          <p role="alert" className={cn(rise, "px-2 text-sm text-destructive")}>
            {error}
          </p>
        )}

        <button
          type="submit"
          style={delay(4)}
          disabled={pending || (step === "email" && !email.trim())}
          className={cn(
            rise,
            "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground transition-[background-color,transform,box-shadow] duration-200 hover:bg-primary/85 hover:shadow-[0_8px_24px_-10px_oklch(0.6_0.12_292/0.8)] active:scale-[0.98]",
            "disabled:bg-muted disabled:text-muted-foreground",
          )}
        >
          {pending && <LoaderIcon className="size-4 animate-spin" />}
          {pending
            ? signingUp
              ? "Creating account…"
              : "Signing in…"
            : step === "email"
              ? "Continue"
              : signingUp
                ? "Create account"
                : "Log in"}
        </button>
      </form>

      <p className={cn(rise, "mt-6 text-sm text-muted-foreground")} style={delay(5)}>
        {signingUp ? "Already have an account? " : "Don't have an account? "}
        <Link href={otherHref} className="font-medium text-foreground hover:underline">
          {signingUp ? "Log in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
