import "server-only";

import { and, count, desc, eq, gte, type SQL, sql } from "drizzle-orm";

import { utcDayStart } from "@/lib/bot/events";
import { readBotSettings } from "@/lib/bot/settings";
import { readWorkerStatus } from "@/lib/bot/status";
import { db } from "@/lib/db";
import { sqlTimestamp } from "@/lib/db/sql";
import { botEvents, botItems, news, sources } from "@/lib/db/schema";
import type { BotItemStatus } from "@/lib/domain/constants";

export async function getBotOverview() {
  const dayStart = utcDayStart();
  const [settings, worker, [items], [spend], [published], [queue]] = await Promise.all([
    readBotSettings(db),
    readWorkerStatus(db),
    db
      .select({
        collected: sql<number>`count(*)::int`,
        screened: sql<number>`count(*) filter (where ${botItems.status} = 'screened_out')::int`,
        rejected: sql<number>`count(*) filter (where ${botItems.status} = 'rejected')::int`,
        duplicate: sql<number>`count(*) filter (where ${botItems.status} = 'duplicate')::int`,
        queued: sql<number>`count(*) filter (where ${botItems.status} = 'queued')::int`,
        published: sql<number>`count(*) filter (where ${botItems.status} = 'published')::int`,
        failed: sql<number>`count(*) filter (where ${botItems.status} = 'failed')::int`,
        waiting: sql<number>`count(*) filter (where ${botItems.status} in ('new', 'processing'))::int`,
      })
      .from(botItems)
      .where(gte(botItems.createdAt, dayStart)),
    db
      .select({
        cost: sql<string | null>`sum(${botEvents.costUsd})`,
        calls: sql<number>`count(*)::int`,
        reads: sql<number>`coalesce(sum((${botEvents.data} ->> 'reads')::int) filter (where ${botEvents.code} = 'source.polled'), 0)::int`,
      })
      .from(botEvents)
      .where(and(gte(botEvents.createdAt, dayStart), sql`${botEvents.code} in ('ai.call', 'source.polled')`)),
    db
      .select({ count: count() })
      .from(news)
      .where(and(eq(news.origin, "bot"), eq(news.status, "published"), gte(news.publishedAt, dayStart))),
    db
      .select({
        pending: sql<number>`count(*) filter (where ${botItems.status} in ('new', 'failed'))::int`,
        failedTotal: sql<number>`count(*) filter (where ${botItems.status} = 'failed')::int`,
      })
      .from(botItems),
  ]);
  const [{ activeSources = 0, failingSources = 0 } = {}] = await db
    .select({
      activeSources: sql<number>`count(*) filter (where ${sources.isActive} and ${sources.kind} <> 'web')::int`,
      failingSources: sql<number>`count(*) filter (where ${sources.isActive} and ${sources.failStreak} >= 3)::int`,
    })
    .from(sources);
  return {
    settings,
    worker,
    today: {
      ...(items ?? { collected: 0, screened: 0, rejected: 0, duplicate: 0, queued: 0, published: 0, failed: 0, waiting: 0 }),
      cost: Number(spend?.cost ?? 0),
      aiCalls: spend?.calls ?? 0,
      xReads: spend?.reads ?? 0,
      autoPublished: published?.count ?? 0,
    },
    backlog: queue ?? { pending: 0, failedTotal: 0 },
    activeSources,
    failingSources,
  };
}

export async function listSourcesWithStats() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const rows = await db
    .select({
      source: sources,
      items24h: sql<number>`(select count(*)::int from ${botItems} where ${botItems.sourceId} = ${sources.id} and ${botItems.createdAt} >= ${sqlTimestamp(since)})`,
      stories24h: sql<number>`(select count(*)::int from ${botItems} where ${botItems.sourceId} = ${sources.id} and ${botItems.createdAt} >= ${sqlTimestamp(since)} and ${botItems.status} in ('queued', 'published'))`,
    })
    .from(sources)
    .orderBy(desc(sources.isActive), sources.kind, sources.name);
  return rows.map(({ source, items24h, stories24h }) => ({
    id: source.id,
    kind: source.kind,
    name: source.name,
    handle: source.handle,
    url: source.url,
    homepageUrl: source.homepageUrl,
    trust: source.trust,
    isActive: source.isActive,
    autoPublish: source.autoPublish,
    pollIntervalMinutes: source.pollIntervalMinutes,
    maxItemsPerPoll: source.maxItemsPerPoll,
    keywordFilter: source.keywordFilter,
    lastPolledAt: source.lastPolledAt?.toISOString() ?? null,
    lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
    nextPollAt: source.nextPollAt.toISOString(),
    failStreak: source.failStreak,
    lastError: source.lastError,
    items24h,
    stories24h,
  }));
}

export type SourceRow = Awaited<ReturnType<typeof listSourcesWithStats>>[number];

export const ITEMS_PAGE_SIZE = 30;

export async function listBotItems(filters: { status?: BotItemStatus; sourceId?: string; page: number }) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(botItems.status, filters.status));
  if (filters.sourceId) conditions.push(eq(botItems.sourceId, filters.sourceId));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: botItems.id,
        title: botItems.title,
        body: botItems.body,
        url: botItems.url,
        status: botItems.status,
        attempts: botItems.attempts,
        lastError: botItems.lastError,
        rejectionReason: botItems.rejectionReason,
        analysis: botItems.analysis,
        geocode: botItems.geocode,
        newsId: botItems.newsId,
        publishedAt: botItems.publishedAt,
        createdAt: botItems.createdAt,
        sourceName: sources.name,
        sourceKind: sources.kind,
      })
      .from(botItems)
      .innerJoin(sources, eq(botItems.sourceId, sources.id))
      .where(where)
      .orderBy(desc(botItems.createdAt))
      .limit(ITEMS_PAGE_SIZE)
      .offset((filters.page - 1) * ITEMS_PAGE_SIZE),
    db.select({ count: count() }).from(botItems).where(where),
  ]);
  return {
    total: total?.count ?? 0,
    items: rows.map((row) => ({
      ...row,
      body: row.body.slice(0, 600),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export type BotItemRow = Awaited<ReturnType<typeof listBotItems>>["items"][number];

export interface BotEventRow {
  id: number;
  level: string;
  code: string;
  message: string | null;
  sourceId: string | null;
  itemId: string | null;
  newsId: string | null;
  data: Record<string, unknown>;
  model: string | null;
  costUsd: number | null;
  durationMs: number | null;
  createdAt: string;
  sourceName: string | null;
}

export async function listRecentEvents(limit = 60, afterId?: number): Promise<BotEventRow[]> {
  const rows = await db
    .select({
      id: botEvents.id,
      level: botEvents.level,
      code: botEvents.code,
      message: botEvents.message,
      sourceId: botEvents.sourceId,
      itemId: botEvents.itemId,
      newsId: botEvents.newsId,
      data: botEvents.data,
      model: botEvents.model,
      costUsd: botEvents.costUsd,
      durationMs: botEvents.durationMs,
      createdAt: botEvents.createdAt,
      sourceName: sources.name,
    })
    .from(botEvents)
    .leftJoin(sources, eq(botEvents.sourceId, sources.id))
    .where(afterId ? sql`${botEvents.id} > ${afterId}` : undefined)
    .orderBy(desc(botEvents.id))
    .limit(limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getEventById(id: number): Promise<BotEventRow | null> {
  const [row] = await db
    .select({
      id: botEvents.id,
      level: botEvents.level,
      code: botEvents.code,
      message: botEvents.message,
      sourceId: botEvents.sourceId,
      itemId: botEvents.itemId,
      newsId: botEvents.newsId,
      data: botEvents.data,
      model: botEvents.model,
      costUsd: botEvents.costUsd,
      durationMs: botEvents.durationMs,
      createdAt: botEvents.createdAt,
      sourceName: sources.name,
    })
    .from(botEvents)
    .leftJoin(sources, eq(botEvents.sourceId, sources.id))
    .where(eq(botEvents.id, id))
    .limit(1);
  return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
}
