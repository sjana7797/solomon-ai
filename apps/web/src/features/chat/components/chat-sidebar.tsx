"use client";

import {
  AnimatedSidebar,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarHeader,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem,
} from "@repo/ui/components/motion/animated-sidebar";
import { Loader } from "@repo/ui/components/motion/loader";
import { ChartLineIcon, CompassIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { AccountButton } from "@/features/auth/components/account-button";

import { useDeleteChat } from "../hooks/use-chat-actions";
import { useChats } from "../hooks/use-chats";
import type { Chat } from "../types";
import { BrandMark } from "./brand-mark";

const DAY = 24 * 60 * 60 * 1000;

function groupChats(chats: Chat[]) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const groups: { label: string; chats: Chat[] }[] = [
    { label: "Today", chats: [] },
    { label: "Yesterday", chats: [] },
    { label: "Previous 7 days", chats: [] },
    { label: "Older", chats: [] },
  ];
  for (const chat of chats) {
    const index =
      chat.updatedAt >= startOfToday
        ? 0
        : chat.updatedAt >= startOfToday - DAY
          ? 1
          : chat.updatedAt >= startOfToday - 7 * DAY
            ? 2
            : 3;
    groups[index]!.chats.push(chat);
  }
  return groups.filter((group) => group.chats.length > 0);
}

export function ChatSidebar() {
  const chats = useChats();
  const router = useRouter();
  const params = useParams<{ chatId?: string }>();
  const pathname = usePathname();
  const deleteChat = useDeleteChat();

  return (
    // Navigation uses onSelect + router.push (not href) so in-flight streams survive.
    <AnimatedSidebar
      collapsible="offcanvas"
      variant="inset"
      ariaLabel="Chats"
      // Sit directly on the canvas; only the conversation panel is raised.
      panelClassName="bg-transparent"
    >
      <AnimatedSidebarHeader>
        <div className="flex items-center gap-2 px-1.5 pt-1 pb-2">
          <BrandMark />
          <span className="text-[0.95rem] font-medium tracking-tight">Solomon</span>
        </div>
        <AnimatedSidebarMenu>
          <AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuButton
              icon={<PlusIcon className="size-4" />}
              isActive={pathname === "/"}
              onSelect={() => router.push("/")}
            >
              New chat
            </AnimatedSidebarMenuButton>
          </AnimatedSidebarMenuItem>
          <AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuButton
              icon={<CompassIcon className="size-4" />}
              isActive={pathname === "/discover"}
              onSelect={() => router.push("/discover")}
            >
              Discover
            </AnimatedSidebarMenuButton>
          </AnimatedSidebarMenuItem>
          <AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuButton
              icon={<ChartLineIcon className="size-4" />}
              isActive={pathname.startsWith("/finance")}
              onSelect={() => router.push("/finance")}
            >
              Finance
            </AnimatedSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </AnimatedSidebarMenu>
      </AnimatedSidebarHeader>

      <AnimatedSidebarContent>
        {chats === undefined ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader variant="dots" size={18} label="Loading chats" />
          </div>
        ) : chats.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Your conversations will show up here.
          </p>
        ) : (
          groupChats(chats).map((group) => (
            <AnimatedSidebarGroup key={group.label}>
              <AnimatedSidebarGroupLabel>{group.label}</AnimatedSidebarGroupLabel>
              <AnimatedSidebarGroupContent>
                <AnimatedSidebarMenu>
                  {group.chats.map((chat) => {
                    const isActive = chat.id === params.chatId;
                    return (
                      <AnimatedSidebarMenuItem key={chat.id} className="group/chat">
                        <AnimatedSidebarMenuButton
                          isActive={isActive}
                          onSelect={() => router.push(`/c/${chat.id}`)}
                          className="pr-9"
                        >
                          {chat.title}
                        </AnimatedSidebarMenuButton>
                        <button
                          type="button"
                          aria-label={`Delete ${chat.title}`}
                          onClick={() => void deleteChat(chat.id, isActive)}
                          className="absolute top-1/2 right-1.5 z-20 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover/chat:opacity-100 hover:bg-background hover:text-destructive focus-visible:opacity-100"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </AnimatedSidebarMenuItem>
                    );
                  })}
                </AnimatedSidebarMenu>
              </AnimatedSidebarGroupContent>
            </AnimatedSidebarGroup>
          ))
        )}
      </AnimatedSidebarContent>

      <AnimatedSidebarFooter>
        <AnimatedSidebarMenu>
          <AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuButton
              icon={<SettingsIcon className="size-4" />}
              isActive={pathname === "/settings"}
              onSelect={() => router.push("/settings")}
            >
              Settings
            </AnimatedSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </AnimatedSidebarMenu>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <AccountButton />
          </div>
          <ThemeToggle />
        </div>
      </AnimatedSidebarFooter>
    </AnimatedSidebar>
  );
}
