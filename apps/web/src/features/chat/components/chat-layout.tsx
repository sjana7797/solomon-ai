import {
  AnimatedSidebarInset,
  AnimatedSidebarProvider,
} from "@repo/ui/components/motion/animated-sidebar";

import { ChatSidebar } from "./chat-sidebar";
import { VaultGate } from "@/features/vault/components/vault-gate";

import { ResumeReplies } from "./resume-replies";

export function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    // Inset shell: the conversation sits on a raised panel over the sidebar's tint.
    <AnimatedSidebarProvider className="bg-sidebar">
      <ResumeReplies />
      <VaultGate />
      <ChatSidebar />
      <AnimatedSidebarInset className="h-svh min-h-0 overflow-hidden md:h-[calc(100svh-1rem)] md:border md:border-border/60 md:shadow-[0_1px_2px_oklch(0_0_0/0.04),0_8px_24px_-12px_oklch(0_0_0/0.10)]">
        {children}
      </AnimatedSidebarInset>
    </AnimatedSidebarProvider>
  );
}
