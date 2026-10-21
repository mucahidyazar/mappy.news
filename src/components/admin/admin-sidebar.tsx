"use client";

import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { RelativeTime } from "@/components/news/relative-time";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Link, usePathname } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

import { ADMIN_NAV, type AdminBadges, isActiveItem, type SidebarBotState } from "./nav";

const BADGE_TONE = {
  attention: "bg-warning/15 text-warning",
  info: "bg-sidebar-primary/15 text-sidebar-primary",
  danger: "bg-destructive/15 text-destructive",
} as const;

const BOT_DOT = { running: "bg-success", paused: "bg-warning", offline: "bg-destructive" } as const;

/** The active item gets a slim bar on its left edge and a tinted icon. */
const ITEM_CLASS =
  "relative h-9 gap-2.5 rounded-lg text-[13.5px] text-sidebar-foreground/80 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary before:opacity-0 before:transition-opacity data-active:text-sidebar-accent-foreground data-active:before:opacity-100 data-active:[&>svg]:text-sidebar-primary";

export function AdminSidebar({ role, badges, bot }: { role: string; badges: AdminBadges; bot: SidebarBotState | null }) {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center px-3">
        <Link href="/admin" className="flex items-center gap-2.5 overflow-hidden rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50">
          <Image src="/brand/web-app-manifest-192x192.png" alt="" width={32} height={32} className="size-8 shrink-0 rounded-[9px] shadow-sm ring-1 ring-black/5" />
          <span className="flex min-w-0 flex-col leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-display text-[15px] font-bold tracking-tight">
              mappy<span className="text-sidebar-foreground/50">.news</span>
            </span>
            <span className="mt-1 font-mono text-[9.5px] tracking-[0.18em] text-sidebar-foreground/45 uppercase">{t("desk")}</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-1">
        {ADMIN_NAV.map((group) => {
          const items = group.items.filter((item) => can(role, item.permission));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label} className="py-1.5">
              <SidebarGroupLabel className="h-7 font-mono text-[10px] tracking-[0.16em] text-sidebar-foreground/40 uppercase">{t(group.label)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((item) => {
                    const count = item.badge ? badges[item.badge.key] : 0;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={isActiveItem(item, pathname)} tooltip={t(item.label)} className={ITEM_CLASS}>
                          <Link href={item.href}>
                            <item.icon />
                            <span>{t(item.label)}</span>
                          </Link>
                        </SidebarMenuButton>
                        {item.badge && count ? (
                          <SidebarMenuBadge className={cn("top-2 rounded-full px-1.5 font-mono text-[10.5px]", BADGE_TONE[item.badge.tone])}>
                            {count > 99 ? "99+" : count}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t border-sidebar-border/70 px-2 py-3">
        <SidebarMenu className="gap-0.5">
          {bot ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={t(`botState.${bot.state}`)} className="h-auto min-h-10 gap-2.5 rounded-lg py-2">
                <Link href="/admin/bot">
                  <span className="relative flex size-4 shrink-0 items-center justify-center" aria-hidden>
                    {bot.state === "running" ? <span className="absolute size-2.5 animate-ping rounded-full bg-success/60 motion-reduce:hidden" /> : null}
                    <span className={cn("relative size-2 rounded-full", BOT_DOT[bot.state])} />
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[13px] font-medium">{t(`botState.${bot.state}`)}</span>
                    {bot.heartbeatAt ? <RelativeTime value={bot.heartbeatAt} className="truncate font-mono text-[10.5px] text-sidebar-foreground/50" /> : null}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("backToSite")} className="h-9 gap-2.5 rounded-lg text-[13px] text-sidebar-foreground/70">
              <Link href="/">
                <ArrowLeft />
                <span>{t("backToSite")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
