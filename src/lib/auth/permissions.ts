import { type UserRole, USER_ROLES } from "@/lib/domain/constants";

export const PERMISSIONS = [
  "admin.access",
  "news.review",
  "news.manage",
  "comments.moderate",
  "verifications.review",
  "users.manage",
  "bot.view",
  "bot.manage",
  "categories.manage",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MODERATOR: Permission[] = ["admin.access", "news.review", "comments.moderate", "verifications.review", "bot.view"];

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  user: [],
  moderator: MODERATOR,
  admin: PERMISSIONS,
};

export function normalizeRole(role: string | null | undefined): UserRole {
  return (USER_ROLES as readonly string[]).includes(role ?? "") ? (role as UserRole) : "user";
}

export function can(role: string | null | undefined, permission: Permission): boolean {
  return ROLE_PERMISSIONS[normalizeRole(role)].includes(permission);
}

export function isStaff(role: string | null | undefined): boolean {
  return can(role, "admin.access");
}
