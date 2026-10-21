import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { type UserRole } from "@/lib/domain/constants";

import { getAuth } from ".";
import { can, normalizeRole, type Permission } from "./permissions";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
  emailVerified: boolean;
}

/** The signed-in user for this request, or null. Banned accounts count as signed out. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const result = await getAuth()
    .api.getSession({ headers: await headers() })
    .catch(() => null);
  if (!result?.user) return null;
  const { user } = result;
  if (user.banned && (!user.banExpires || new Date(user.banExpires) > new Date())) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    role: normalizeRole(user.role),
    emailVerified: user.emailVerified,
  };
});

export class AuthError extends Error {
  constructor(public readonly code: "unauthenticated" | "forbidden" | "unverified") {
    super(code);
    this.name = "AuthError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("unauthenticated");
  if (!user.emailVerified) throw new AuthError("unverified");
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) throw new AuthError("forbidden");
  return user;
}
