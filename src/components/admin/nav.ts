import {
  Activity,
  FileClock,
  Inbox,
  LayoutDashboard,
  ListTree,
  type LucideIcon,
  MapPinCheck,
  MessageSquare,
  Newspaper,
  Rss,
  Settings2,
  Shapes,
  Users,
} from "lucide-react";

import type { Permission } from "@/lib/auth/permissions";

export type AdminBadges = { pendingNews: number; pendingVerifications: number; failedItems: number };

export type SidebarBotState = { state: "running" | "paused" | "offline"; heartbeatAt: string | null };

export interface AdminNavItem {
  href: string;
  label: "dashboard" | "review" | "news" | "verifications" | "comments" | "botStatus" | "botSources" | "botItems" | "botSettings" | "users" | "categories" | "audit";
  icon: LucideIcon;
  permission: Permission;
  /** Count shown next to the item; "attention" waits for an editor, "danger" is something broken. */
  badge?: { key: keyof AdminBadges; tone: "attention" | "info" | "danger" };
  exact?: boolean;
}

export interface AdminNavGroup {
  label: "overview" | "content" | "bot" | "management";
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "overview",
    items: [{ href: "/admin", label: "dashboard", icon: LayoutDashboard, permission: "admin.access", exact: true }],
  },
  {
    label: "content",
    items: [
      { href: "/admin/review", label: "review", icon: Inbox, permission: "news.review", badge: { key: "pendingNews", tone: "attention" } },
      { href: "/admin/news", label: "news", icon: Newspaper, permission: "news.review" },
      { href: "/admin/verifications", label: "verifications", icon: MapPinCheck, permission: "verifications.review", badge: { key: "pendingVerifications", tone: "info" } },
      { href: "/admin/comments", label: "comments", icon: MessageSquare, permission: "comments.moderate" },
    ],
  },
  {
    label: "bot",
    items: [
      { href: "/admin/bot", label: "botStatus", icon: Activity, permission: "bot.view", exact: true },
      { href: "/admin/bot/sources", label: "botSources", icon: Rss, permission: "bot.view" },
      { href: "/admin/bot/items", label: "botItems", icon: ListTree, permission: "bot.view", badge: { key: "failedItems", tone: "danger" } },
      { href: "/admin/bot/settings", label: "botSettings", icon: Settings2, permission: "bot.manage" },
    ],
  },
  {
    label: "management",
    items: [
      { href: "/admin/users", label: "users", icon: Users, permission: "users.manage" },
      { href: "/admin/categories", label: "categories", icon: Shapes, permission: "categories.manage" },
      { href: "/admin/audit", label: "audit", icon: FileClock, permission: "audit.view" },
    ],
  },
];

export function isActiveItem(item: AdminNavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The group and item a path belongs to, for the breadcrumb. */
export function locateNav(pathname: string) {
  for (const group of ADMIN_NAV) {
    const item = group.items.find((entry) => isActiveItem(entry, pathname));
    if (item) return { group, item, nested: pathname !== item.href };
  }
  return null;
}
