import { cn } from "@repo/ui/lib/utils";
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";

import { formatChange, formatPercent, trend } from "../lib/format";

export const TREND_TEXT = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-rose-600 dark:text-rose-400",
  flat: "text-muted-foreground",
} as const;

/** "+12.30 (+1.20%)" coloured by direction. */
export function ChangeText({
  change,
  changePercent,
  showAbsolute = true,
  className,
}: {
  change: number | null;
  changePercent: number | null;
  showAbsolute?: boolean;
  className?: string;
}) {
  const direction = trend(changePercent ?? change);
  const Icon = direction === "down" ? ArrowDownRightIcon : ArrowUpRightIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular-nums",
        TREND_TEXT[direction],
        className,
      )}
    >
      {direction !== "flat" && <Icon className="size-[1.1em] shrink-0" aria-hidden />}
      {showAbsolute && <span>{formatChange(change)}</span>}
      <span>{showAbsolute ? `(${formatPercent(changePercent)})` : formatPercent(changePercent)}</span>
    </span>
  );
}
