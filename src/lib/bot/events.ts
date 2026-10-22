import { and, eq, gte, sql } from "drizzle-orm";

import { botEvents } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/types";

/** Event codes; the admin panel translates them under `admin.bot.events.<code>`. */
export type BotEventCode =
  | "worker.started"
  | "worker.stopped"
  | "worker.lock_waiting"
  | "worker.pass_failed"
  | "source.polled"
  | "source.not_modified"
  | "source.failed"
  | "source.skipped_budget"
  | "item.screened_out"
  | "item.analyzed"
  | "item.rejected"
  | "item.duplicate"
  | "item.queued"
  | "item.published"
  | "item.failed"
  | "item.no_location"
  | "ai.call"
  | "ai.failed"
  | "ai.paused"
  | "ai.budget_reached"
  | "geocode.failed"
  | "settings.changed"
  | "scan.requested";

export interface BotEventInput {
  code: BotEventCode;
  level?: "info" | "warn" | "error";
  message?: string | null;
  sourceId?: string | null;
  itemId?: string | null;
  newsId?: string | null;
  data?: Record<string, unknown>;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  durationMs?: number | null;
}

/** Appends to the bot log. Never throws: a logging failure must not fail the step that produced it. */
export async function emitEvent(db: DbExecutor, event: BotEventInput): Promise<void> {
  try {
    await db.insert(botEvents).values({
      code: event.code,
      level: event.level ?? "info",
      message: event.message ? event.message.slice(0, 500) : null,
      sourceId: event.sourceId ?? null,
      itemId: event.itemId ?? null,
      newsId: event.newsId ?? null,
      data: event.data ?? {},
      model: event.model ?? null,
      inputTokens: event.inputTokens ?? null,
      outputTokens: event.outputTokens ?? null,
      costUsd: event.costUsd ?? null,
      durationMs: event.durationMs ?? null,
    });
  } catch (error) {
    console.warn("[bot] could not write event", event.code, (error as Error).message);
  }
}

export function utcDayStart(now = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/** AI spend since the start of the UTC day, in USD. */
export async function aiSpendToday(db: DbExecutor, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | null>`sum(${botEvents.costUsd})` })
    .from(botEvents)
    .where(and(eq(botEvents.code, "ai.call"), gte(botEvents.createdAt, utcDayStart(now))));
  return Number(row?.total ?? 0);
}

/** X posts read since the start of the UTC day. */
export async function xReadsToday(db: DbExecutor, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum((${botEvents.data} ->> 'reads')::int), 0)::int` })
    .from(botEvents)
    .where(and(eq(botEvents.code, "source.polled"), gte(botEvents.createdAt, utcDayStart(now)), sql`${botEvents.data} ? 'reads'`));
  return row?.total ?? 0;
}

/** A short error description that never carries SQL parameters or tokens. */
/** "location.mention: Invalid input: expected string, received null" from a schema error anywhere in the chain. */
function schemaIssues(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const issues = (current as { issues?: unknown }).issues;
    if (Array.isArray(issues) && issues.length) {
      return issues
        .slice(0, 3)
        .map((issue: { path?: PropertyKey[]; message?: string }) => `${(issue.path ?? []).map(String).join(".") || "(root)"}: ${issue.message ?? "invalid"}`)
        .join("; ");
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    const base = error.message.split("\n")[0] ?? error.name;
    // A model answer that missed the schema: which fields, not the answer itself (it fills the whole message).
    const issues = schemaIssues(error);
    const extra = issues ? ` (${issues})` : cause instanceof Error ? ` (${cause.message.split("\n")[0]})` : "";
    return `${base}${extra}`.replace(/Bearer\s+[\w.-]+/gi, "Bearer ***").slice(0, 300);
  }
  return String(error).slice(0, 300);
}
