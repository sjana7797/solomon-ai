import { cn } from "@repo/ui/lib/utils";
import { LoaderIcon } from "lucide-react";

/** Shared look for the auth and vault screens. */
export const pill =
  "h-11 w-full rounded-full border border-border/80 bg-card px-5 text-sm transition-colors outline-none placeholder:text-muted-foreground/60 focus:border-primary/80 focus-visible:ring-2 focus-visible:ring-ring/40";

// Staggered entrance; each element rises in after the previous one.
export const rise = "animate-rise motion-reduce:animate-none";
export const delay = (step: number) => ({ animationDelay: `${120 + step * 70}ms` });

export function SubmitButton({
  pending,
  children,
  pendingLabel,
  disabled,
  step = 4,
}: {
  pending?: boolean;
  children: React.ReactNode;
  pendingLabel?: string;
  disabled?: boolean;
  step?: number;
}) {
  return (
    <button
      type="submit"
      style={delay(step)}
      disabled={pending || disabled}
      className={cn(
        rise,
        "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground transition-[background-color,transform,box-shadow] duration-200 hover:bg-primary/85 hover:shadow-[0_8px_24px_-10px_oklch(0.6_0.12_292/0.8)] active:scale-[0.98]",
        "disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
      )}
    >
      {pending && <LoaderIcon className="size-4 animate-spin" />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className={cn(rise, "px-2 text-sm text-destructive")}>
      {children}
    </p>
  );
}
