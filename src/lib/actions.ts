import "server-only";

import { z } from "zod";

import { AuthError } from "@/lib/auth/session";

export type ActionErrorCode =
  | "unauthenticated"
  | "unverified"
  | "forbidden"
  | "invalid"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "server";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: ActionErrorCode; message?: string; fieldErrors?: Record<string, string[] | undefined> };

/** Expected failures that the UI can explain; anything else becomes a generic "server" error. */
export class ActionError extends Error {
  constructor(
    public readonly code: ActionErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ActionError";
  }
}

export async function runAction<T>(task: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await task() };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, error: error.code };
    if (error instanceof ActionError) return { ok: false, error: error.code, message: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: "invalid", fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> };
    }
    console.error("[action] unexpected error", error);
    return { ok: false, error: "server" };
  }
}
