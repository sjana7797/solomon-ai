"use client";

import { ThemeProvider } from "next-themes";

import { TRPCReactProvider } from "@/trpc/client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TRPCReactProvider>{children}</TRPCReactProvider>
    </ThemeProvider>
  );
}
