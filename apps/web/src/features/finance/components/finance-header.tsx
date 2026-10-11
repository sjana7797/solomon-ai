import { AnimatedSidebarTrigger } from "@repo/ui/components/motion/animated-sidebar";
import { PanelLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

export function FinanceHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3">
      <AnimatedSidebarTrigger className="size-8 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <PanelLeftIcon className="size-4" />
      </AnimatedSidebarTrigger>
      {children}
    </header>
  );
}
