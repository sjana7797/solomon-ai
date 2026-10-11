"use client";

import { ThemeToggle as BeuiThemeToggle } from "@repo/ui/components/motion/theme-toggle";

export function ThemeToggle() {
  return (
    <BeuiThemeToggle
      variant="circle"
      start="bottom-left"
      className="size-8 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      iconClassName="size-4"
    />
  );
}
