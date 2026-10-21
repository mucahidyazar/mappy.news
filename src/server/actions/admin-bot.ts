"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, type ActionResult, runAction } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { emitEvent } from "@/lib/bot/events";
import { botSettingsSchema, readBotSettings, writeBotSettings } from "@/lib/bot/settings";
import { pollFeed } from "@/lib/bot/sources/rss";
import { normalizeHandle } from "@/lib/bot/sources/x";
import { CONTROL_CHANNEL } from "@/lib/bot/status";
import { requirePermission } from "@/lib/auth/session";
import { db, getSql } from "@/lib/db";
import { botItems, sources } from "@/lib/db/schema";
import { SOURCE_KINDS, SOURCE_TRUST_LEVELS } from "@/lib/domain/constants";

function refresh() {
  revalidatePath("/", "layout");
}

async function notifyWorker(command: "scan" | "settings") {
  await getSql().notify(CONTROL_CHANNEL, command);
}

export async function setBotEnabled(enabled: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("bot.manage");
    const settings = await readBotSettings(db);
    await writeBotSettings(db, { ...settings, enabled: Boolean(enabled) }, editor.id);
    await audit(db, { actorId: editor.id, action: enabled ? "bot.resume" : "bot.pause", targetType: "bot" });
    await emitEvent(db, { code: "settings.changed", data: { enabled: Boolean(enabled) } });
    await notifyWorker("settings");
    refresh();
    return null;
  });
}

export async function saveBotSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("bot.manage");
    const settings = botSettingsSchema.parse(input);
    await writeBotSettings(db, settings, editor.id);
    await audit(db, { actorId: editor.id, action: "bot.settings", targetType: "bot", data: { provider: settings.ai.provider, model: settings.ai.model, autoPublish: settings.autoPublish.mode } });
    await emitEvent(db, { code: "settings.changed", data: { model: settings.ai.model, autoPublish: settings.autoPublish.mode, dryRun: settings.dryRun } });
    await notifyWorker("settings");
    refresh();
    return null;
  });
}

/** Wakes the worker to poll every due source now; with a source id, that source is made due first. */
export async function scanNow(sourceId?: string): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("bot.view");
    if (sourceId) {
      await db.update(sources).set({ nextPollAt: new Date() }).where(eq(sources.id, z.uuid().parse(sourceId)));
    }
    await emitEvent(db, { code: "scan.requested", sourceId: sourceId ?? null, data: { by: editor.name } });
    await notifyWorker("scan");
    return null;
  });
}

const sourceSchema = z
  .object({
    id: z.uuid().optional(),
    kind: z.enum(SOURCE_KINDS),
    name: z.string().trim().min(2).max(80),
    url: z.string().trim().max(500).optional().transform((value) => value || null),
    handle: z.string().trim().max(60).optional().transform((value) => value || null),
    homepageUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]).optional().transform((value) => value || null),
    trust: z.enum(SOURCE_TRUST_LEVELS),
    isActive: z.boolean(),
    autoPublish: z.boolean(),
    pollIntervalMinutes: z.number().int().min(5).max(24 * 60),
    maxItemsPerPoll: z.number().int().min(5).max(100),
    keywordFilter: z.array(z.string().trim().min(2).max(40)).max(30),
  })
  .transform((value, context) => {
    if (value.kind === "x") {
      const handle = normalizeHandle(value.handle ?? value.url ?? "");
      if (!handle) context.addIssue({ code: "custom", path: ["handle"], message: "handle" });
      return { ...value, handle, url: handle ? `https://x.com/${handle}` : null };
    }
    if (value.kind === "rss" && !(value.url && /^https?:\/\//.test(value.url))) {
      context.addIssue({ code: "custom", path: ["url"], message: "url" });
    }
    return { ...value, handle: null };
  });

export async function saveSource(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const editor = await requirePermission("bot.manage");
    const data = sourceSchema.parse(input);
    const values = {
      kind: data.kind,
      name: data.name,
      url: data.url,
      handle: data.handle,
      homepageUrl: data.homepageUrl ?? (data.kind === "x" ? data.url : null),
      trust: data.trust,
      isActive: data.isActive,
      autoPublish: data.autoPublish,
      pollIntervalMinutes: data.pollIntervalMinutes,
      maxItemsPerPoll: data.maxItemsPerPoll,
      keywordFilter: data.keywordFilter,
    };
    const id = await db.transaction(async (tx) => {
      if (data.id) {
        const [updated] = await tx.update(sources).set(values).where(eq(sources.id, data.id)).returning({ id: sources.id });
        if (!updated) throw new ActionError("not_found");
        await audit(tx, { actorId: editor.id, action: "source.update", targetType: "source", targetId: data.id, data: { name: data.name } });
        return updated.id;
      }
      const [created] = await tx.insert(sources).values(values).onConflictDoNothing().returning({ id: sources.id });
      if (!created) throw new ActionError("conflict", "exists");
      await audit(tx, { actorId: editor.id, action: "source.create", targetType: "source", targetId: created.id, data: { name: data.name, kind: data.kind } });
      return created.id;
    });
    refresh();
    return { id };
  });
}

export async function toggleSource(input: { id: string; field: "isActive" | "autoPublish"; value: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("bot.manage");
    const id = z.uuid().parse(input.id);
    const field = z.enum(["isActive", "autoPublish"]).parse(input.field);
    await db.update(sources).set({ [field]: Boolean(input.value), ...(field === "isActive" && input.value ? { nextPollAt: new Date(), failStreak: 0 } : {}) }).where(eq(sources.id, id));
    await audit(db, { actorId: editor.id, action: `source.${field}`, targetType: "source", targetId: id, data: { value: input.value } });
    refresh();
    return null;
  });
}

export async function deleteSource(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const editor = await requirePermission("bot.manage");
    const sourceId = z.uuid().parse(id);
    await db.transaction(async (tx) => {
      const [removed] = await tx.delete(sources).where(eq(sources.id, sourceId)).returning({ name: sources.name });
      if (!removed) throw new ActionError("not_found");
      await audit(tx, { actorId: editor.id, action: "source.delete", targetType: "source", targetId: sourceId, data: { name: removed.name } });
    });
    refresh();
    return null;
  });
}

/** Fetches a feed once and returns its newest entries, so an editor can check a URL before adding it. */
export async function previewFeed(url: string): Promise<ActionResult<{ title: string; publishedAt: string | null }[]>> {
  return runAction(async () => {
    await requirePermission("bot.manage");
    const target = z.url({ protocol: /^https?$/ }).parse(url.trim());
    try {
      const { entries } = await pollFeed(target, {});
      return entries.slice(0, 5).map((entry) => ({ title: entry.title ?? entry.body.slice(0, 120), publishedAt: entry.publishedAt?.toISOString() ?? null }));
    } catch (error) {
      throw new ActionError("invalid", (error as Error).message.slice(0, 200));
    }
  });
}

/** Sends items back to the queue: one item, or every failed item. */
export async function retryItems(input: { id?: string; allFailed?: boolean }): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const editor = await requirePermission("bot.manage");
    const condition = input.id
      ? and(eq(botItems.id, z.uuid().parse(input.id)), inArray(botItems.status, ["failed", "rejected", "screened_out"]))
      : input.allFailed
        ? eq(botItems.status, "failed")
        : null;
    if (!condition) throw new ActionError("invalid");
    const updated = await db
      .update(botItems)
      .set({ status: "new", attempts: 0, nextAttemptAt: new Date(), lockedUntil: null, lastError: null, rejectionReason: null })
      .where(condition)
      .returning({ id: botItems.id });
    await audit(db, { actorId: editor.id, action: "bot.retry", targetType: "bot_item", targetId: input.id ?? null, data: { count: updated.length } });
    refresh();
    return { count: updated.length };
  });
}
