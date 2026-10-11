import { cn } from "@repo/ui/lib/utils";
import { SparklesIcon } from "lucide-react";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/70 text-primary-foreground",
        className,
      )}
    >
      <SparklesIcon className="size-3.5" />
    </span>
  );
}
