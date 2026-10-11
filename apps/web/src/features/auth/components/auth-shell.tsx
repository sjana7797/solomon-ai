import { PixelArt } from "./pixel-art";

/** Split card: animated pixel art on the left, content on the right. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh bg-sidebar p-2">
      <div className="flex flex-1 overflow-hidden rounded-2xl border border-border/60 bg-background">
        <div aria-hidden className="relative hidden w-1/2 lg:block">
          <PixelArt className="absolute inset-0 overflow-hidden" />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-12">{children}</div>
      </div>
    </main>
  );
}
