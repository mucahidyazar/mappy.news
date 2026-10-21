"use client";

import {
  Activity,
  ArrowLeft,
  FileClock,
  Inbox,
  LayoutDashboard,
  ListTree,
  MapPinCheck,
  MessageSquare,
  Newspaper,
  Rss,
  Settings2,
  Shapes,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Logo } from "@/components/layout/logo";
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
import { can, type Permission } from "@/lib/auth/permissions";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Inbox;
  permission: Permission;
  badge?: number;
  exact?: boolean;
}

export function AdminSidebar({
  role,
  badges,
}: {
  role: string;
  badges: { pendingNews: number; pendingVerifications: number; failedItems: number };
}) {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: t("overview"),
      items: [{ href: "/admin", label: t("dashboard"), icon: LayoutDashboard, permission: "admin.access", exact: true }],
    },
    {
      label: t("content"),
      items: [
        { href: "/admin/review", label: t("review"), icon: Inbox, permission: "news.review", badge: badges.pendingNews },
        { href: "/admin/news", label: t("news"), icon: Newspaper, permission: "news.review" },
        { href: "/admin/verifications", label: t("verifications"), icon: MapPinCheck, permission: "verifications.review", badge: badges.pendingVerifications },
        { href: "/admin/comments", label: t("comments"), icon: MessageSquare, permission: "comments.moderate" },
      ],
    },
    {
      label: t("bot"),
      items: [
        { href: "/admin/bot", label: t("botStatus"), icon: Activity, permission: "bot.view", exact: true },
        { href: "/admin/bot/sources", label: t("botSources"), icon: Rss, permission: "bot.view" },
        { href: "/admin/bot/items", label: t("botItems"), icon: ListTree, permission: "bot.view", badge: badges.failedItems },
        { href: "/admin/bot/settings", label: t("botSettings"), icon: Settings2, permission: "bot.manage" },
      ],
    },
    {
      label: t("management"),
      items: [
        { href: "/admin/users", label: t("users"), icon: Users, permission: "users.manage" },
        { href: "/admin/categories", label: t("categories"), icon: Shapes, permission: "categories.manage" },
        { href: "/admin/audit", label: t("audit"), icon: FileClock, permission: "audit.view" },
      ],
    },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b px-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <Logo compact />
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase group-data-[collapsible=icon]:hidden">
            admin
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => {
          const items = group.items.filter((item) => can(role, item.permission));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {item.badge ? <SidebarMenuBadge>{item.badge > 99 ? "99+" : item.badge}</SidebarMenuBadge> : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("backToSite")}>
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
