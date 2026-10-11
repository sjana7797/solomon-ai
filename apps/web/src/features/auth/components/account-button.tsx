"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogInIcon, LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { clearAccessToken, signOut, useSession } from "../lib/auth-client";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Sidebar footer: who's signed in, or a sign-in link. */
export function AccountButton() {
  const { data, isPending } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  if (isPending) return <div className="h-11" aria-hidden />;

  if (!data) {
    return (
      <button
        type="button"
        onClick={() => router.push("/sign-in")}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent"
      >
        <span className="grid size-7 place-items-center rounded-full bg-muted text-muted-foreground">
          <LogInIcon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Sign in</span>
          <span className="block truncate text-xs text-muted-foreground">Chats stay on this device</span>
        </span>
      </button>
    );
  }

  const { user } = data;
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/70 text-[11px] font-semibold text-primary-foreground">
        {initials(user.name || user.email)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{user.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
      </span>
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        onClick={async () => {
          await signOut();
          clearAccessToken();
          await queryClient.invalidateQueries();
          router.refresh();
        }}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        <LogOutIcon className="size-4" />
      </button>
    </div>
  );
}
