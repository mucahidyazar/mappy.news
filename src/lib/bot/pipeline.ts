import { createHash } from "node:crypto";

import { and, asc, eq, gt, gte, inArray, isNotNull, lt, lte, ne, or, sql } from "drizzle-orm";

import { botEvents, botItems, categories, geocodeCache, news, newsViews, sources } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import { precisionRank } from "@/lib/domain/location";
import { foldTurkish } from "@/lib/domain/text";
import type { BotAnalysis, ParentSuggestion } from "@/lib/domain/types";
import type { Geocoder } from "@/lib/geo/geocoder";
import { addCitation, createNews } from "@/lib/news/write";

import { type AiKeys, createModel, estimateCost, providerRefusal } from "./ai";
import { analyzeEntry, type AnalyzeResult, type PromptCategory } from "./analyze";
import { decideDedupe, type DedupeSubject, loadDedupeCandidates } from "./dedupe";
import { aiSpendToday, emitEvent, errorMessage, utcDayStart, xReadsToday } from "./events";
import { locate } from "./locate";
import type { SafeFetchOptions } from "./net";
import { screenEntry } from "./screen";
import { type AiPause, autoPublishActive, type BotSettings } from "./settings";
import { fetchArticleText } from "./sources/article";
import { pollFeed } from "./sources/rss";
import type { CollectedEntry } from "./sources/types";
import { normalizeHandle, pollXAccount, XApiError } from "./sources/x";

export const MAX_ATTEMPTS = 4;
const LEASE_MINUTES = 10;
/** Feed texts shorter than this are treated as teasers and the story page is read. */
const ARTICLE_TEASER_CHARS = 1_200;

type Source = typeof sources.$inferSelect;
type Item = typeof botItems.$inferSelect;

export interface BotContext {
  db: AppDatabase;
  settings: BotSettings;
  geocoder: Geocoder;
  keys: AiKeys;
  xToken?: string;
  signal?: AbortSignal;
  now?: () => Date;
  /** Replaced in tests. */
  analyze?: (input: Parameters<typeof analyzeEntry>[0]) => Promise<AnalyzeResult>;
  /** Replaced in tests: HTTP and DNS for feeds and the X API. */
  net?: Pick<SafeFetchOptions, "fetchImpl" | "resolve">;
  log?: (message: string) => void;
}

const now = (ctx: BotContext) => (ctx.now ? ctx.now() : new Date());

export function contentHash(entry: { title: string | null; body: string }) {
  return createHash("sha256")
    .update(foldTurkish(`${entry.title ?? ""} ${entry.body}`).replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim())
    .digest("hex");
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (index < items.length) {
      const item = items[index++]!;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/* ------------------------------------------------------------------ collecting */

/** Leases due sources so that concurrent passes never poll the same source twice. */
export async function leaseDueSources(ctx: BotContext, options: { limit?: number; sourceId?: string } = {}): Promise<Source[]> {
  const at = now(ctx);
  return ctx.db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(sources)
      .where(
        and(
          eq(sources.isActive, true),
          inArray(sources.kind, ["rss", "x"]),
          options.sourceId ? eq(sources.id, options.sourceId) : lte(sources.nextPollAt, at),
        ),
      )
      .orderBy(asc(sources.nextPollAt))
      .limit(options.limit ?? 10)
      .for("update", { skipLocked: true });
    for (const source of due) {
      await tx
        .update(sources)
        .set({ nextPollAt: new Date(at.getTime() + source.pollIntervalMinutes * 60_000), lastPolledAt: at })
        .where(eq(sources.id, source.id));
    }
    return due;
  });
}

async function storeEntries(ctx: BotContext, source: Source, entries: CollectedEntry[]): Promise<number> {
  const cutoff = now(ctx).getTime() - ctx.settings.review.maxAgeHours * 3600 * 1000;
  const fresh = entries
    .filter((entry) => !entry.publishedAt || entry.publishedAt.getTime() >= cutoff)
    .slice(0, source.maxItemsPerPoll);
  if (fresh.length === 0) return 0;
  const inserted = await ctx.db
    .insert(botItems)
    .values(
      fresh.map((entry) => ({
        sourceId: source.id,
        externalId: entry.externalId,
        url: entry.url,
        title: entry.title,
        body: entry.body,
        author: entry.author,
        publishedAt: entry.publishedAt,
        media: entry.media,
        contentHash: contentHash(entry),
        nextAttemptAt: now(ctx),
      })),
    )
    .onConflictDoNothing()
    .returning({ id: botItems.id });
  return inserted.length;
}

/** Polls one source and stores its new entries. Failures back off and never throw. */
export async function pollSource(ctx: BotContext, source: Source): Promise<{ fetched: number; stored: number }> {
  const started = Date.now();
  try {
    let entries: CollectedEntry[] = [];
    let cursor = source.cursor;
    let externalId = source.externalId;
    const data: Record<string, unknown> = {};

    if (source.kind === "rss") {
      if (!source.url) throw new Error("Feed URL missing");
      const result = await pollFeed(source.url, source.cursor, { signal: ctx.signal, ...ctx.net });
      if (result.notModified) {
        await ctx.db.update(sources).set({ lastSuccessAt: now(ctx), failStreak: 0, lastError: null }).where(eq(sources.id, source.id));
        await emitEvent(ctx.db, { code: "source.not_modified", sourceId: source.id, durationMs: Date.now() - started });
        return { fetched: 0, stored: 0 };
      }
      entries = result.entries;
      cursor = result.cursor;
    } else if (source.kind === "x") {
      const handle = normalizeHandle(source.handle ?? "");
      if (!handle) throw new Error("X handle missing");
      if (!ctx.xToken) {
        await emitEvent(ctx.db, { code: "source.skipped_budget", level: "warn", sourceId: source.id, message: "X_BEARER_TOKEN is not set" });
        return { fetched: 0, stored: 0 };
      }
      if ((await xReadsToday(ctx.db, now(ctx))) >= ctx.settings.x.dailyReadLimit) {
        await emitEvent(ctx.db, { code: "source.skipped_budget", sourceId: source.id, message: "X daily read limit reached" });
        return { fetched: 0, stored: 0 };
      }
      const result = await pollXAccount({
        handle,
        userId: source.externalId,
        sinceId: source.cursor.sinceId,
        maxResults: source.maxItemsPerPoll,
        token: ctx.xToken,
        signal: ctx.signal,
        fetchImpl: ctx.net?.fetchImpl,
      });
      entries = result.entries;
      externalId = result.userId;
      cursor = { ...source.cursor, sinceId: result.sinceId };
      data.reads = result.reads;
    }

    const stored = await storeEntries(ctx, source, entries);
    await ctx.db
      .update(sources)
      .set({ cursor, externalId, lastSuccessAt: now(ctx), failStreak: 0, lastError: null })
      .where(eq(sources.id, source.id));
    await emitEvent(ctx.db, {
      code: "source.polled",
      sourceId: source.id,
      data: { ...data, fetched: entries.length, stored },
      durationMs: Date.now() - started,
    });
    return { fetched: entries.length, stored };
  } catch (error) {
    const streak = source.failStreak + 1;
    const backoffMinutes = Math.min(source.pollIntervalMinutes * 2 ** Math.min(streak, 5), 6 * 60);
    let nextPollAt = new Date(now(ctx).getTime() + backoffMinutes * 60_000);
    if (error instanceof XApiError && error.resetAt) nextPollAt = new Date(Math.max(nextPollAt.getTime(), error.resetAt.getTime()));
    await ctx.db
      .update(sources)
      .set({ failStreak: streak, lastError: errorMessage(error), nextPollAt })
      .where(eq(sources.id, source.id));
    await emitEvent(ctx.db, {
      code: "source.failed",
      level: streak >= 3 ? "error" : "warn",
      sourceId: source.id,
      message: errorMessage(error),
      data: { failStreak: streak, nextPollAt: nextPollAt.toISOString() },
      durationMs: Date.now() - started,
    });
    return { fetched: 0, stored: 0 };
  }
}

export async function collect(ctx: BotContext, options: { limit?: number; sourceId?: string } = {}) {
  const due = await leaseDueSources(ctx, options);
  let stored = 0;
  await pool(due, 3, async (source) => {
    if (ctx.signal?.aborted) return;
    stored += (await pollSource(ctx, source)).stored;
  });
  return { sources: due.length, stored };
}

/* ------------------------------------------------------------------ processing */

/** Leases items that are new, due for a retry or abandoned by a crashed worker. */
export async function leaseItems(ctx: BotContext, limit: number): Promise<Array<{ item: Item; source: Source }>> {
  const at = now(ctx);
  return ctx.db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: botItems.id })
      .from(botItems)
      .where(
        and(
          lt(botItems.attempts, MAX_ATTEMPTS),
          or(
            and(inArray(botItems.status, ["new", "failed"]), lte(botItems.nextAttemptAt, at)),
            and(eq(botItems.status, "processing"), lt(botItems.lockedUntil, at)),
          ),
        ),
      )
      .orderBy(asc(botItems.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    await tx
      .update(botItems)
      .set({ status: "processing", lockedUntil: new Date(at.getTime() + LEASE_MINUTES * 60_000), attempts: sql`${botItems.attempts} + 1` })
      .where(inArray(botItems.id, ids));
    return tx
      .select({ item: botItems, source: sources })
      .from(botItems)
      .innerJoin(sources, eq(botItems.sourceId, sources.id))
      .where(inArray(botItems.id, ids));
  });
}

async function finish(ctx: BotContext, item: Item, patch: Partial<typeof botItems.$inferInsert>) {
  await ctx.db
    .update(botItems)
    .set({ lockedUntil: null, lastError: null, processedAt: now(ctx), ...patch })
    .where(eq(botItems.id, item.id));
}

/** Gives a leased item back without counting the attempt (budget or configuration pauses). */
async function release(ctx: BotContext, item: Item, retryAt: Date) {
  await ctx.db
    .update(botItems)
    .set({ status: "new", lockedUntil: null, nextAttemptAt: retryAt, attempts: sql`greatest(0, ${botItems.attempts} - 1)` })
    .where(eq(botItems.id, item.id));
}

async function fail(ctx: BotContext, item: Item, error: unknown) {
  // The lease already counted this attempt.
  const attempts = item.attempts;
  const delayMinutes = Math.min(5 * 2 ** (attempts - 1), 6 * 60);
  await ctx.db
    .update(botItems)
    .set({ status: "failed", lockedUntil: null, lastError: errorMessage(error), nextAttemptAt: new Date(now(ctx).getTime() + delayMinutes * 60_000) })
    .where(eq(botItems.id, item.id));
  await emitEvent(ctx.db, {
    code: "item.failed",
    level: attempts >= MAX_ATTEMPTS ? "error" : "warn",
    itemId: item.id,
    sourceId: item.sourceId,
    message: errorMessage(error),
    data: { attempts },
  });
}

export interface PassState {
  budgetAnnounced?: string;
  missingKeyAnnounced?: boolean;
  /** Kept across passes by the worker and shown on the admin page. */
  aiPause?: AiPause | null;
}

/** The pause that still applies to the configured provider and model, if any. */
export function activePause(state: PassState, settings: BotSettings, at: Date): AiPause | null {
  const pause = state.aiPause;
  if (!pause || new Date(pause.until) <= at) return null;
  return pause.provider === settings.ai.provider && pause.model === settings.ai.model ? pause : null;
}

export interface ProcessingContext {
  categories: Array<PromptCategory & { id: string; isSensitive: boolean }>;
  state: PassState;
}

export async function loadPromptCategories(db: AppDatabase) {
  return db
    .select({ id: categories.id, key: categories.key, nameTr: categories.nameTr, aiHint: categories.aiHint, isSensitive: categories.isSensitive })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder));
}

async function publishedByBotToday(ctx: BotContext) {
  const [row] = await ctx.db
    .select({ count: sql<number>`count(*)::int` })
    .from(news)
    .where(and(eq(news.origin, "bot"), eq(news.status, "published"), gte(news.publishedAt, utcDayStart(now(ctx)))));
  return row?.count ?? 0;
}

/** Runs one leased item through screening, analysis, location, de-duplication and publishing. */
export async function processItem(ctx: BotContext, processing: ProcessingContext, item: Item, source: Source): Promise<Item["status"]> {
  const { settings } = ctx;
  try {
    const screen = screenEntry({
      title: item.title,
      body: item.body,
      publishedAt: item.publishedAt,
      trust: source.trust,
      keywordFilter: source.keywordFilter,
      maxAgeHours: settings.review.maxAgeHours,
      keywordPrefilter: settings.review.keywordPrefilter,
      now: now(ctx),
    });
    if (!screen.pass) {
      await finish(ctx, item, { status: "screened_out", rejectionReason: screen.reason });
      await emitEvent(ctx.db, { code: "item.screened_out", itemId: item.id, sourceId: source.id, data: { reason: screen.reason, matched: screen.matched } });
      return "screened_out";
    }

    // The same text from another feed: cite it on the story the first copy produced.
    const [twin] = await ctx.db
      .select({ newsId: botItems.newsId })
      .from(botItems)
      .where(and(eq(botItems.contentHash, item.contentHash), ne(botItems.id, item.id), isNotNull(botItems.newsId)))
      .limit(1);
    if (twin?.newsId) {
      if (item.url) {
        await addCitation(ctx.db, twin.newsId, { url: item.url, title: item.title, publisherName: source.name, publishedAt: item.publishedAt, sourceId: source.id });
      }
      await finish(ctx, item, { status: "duplicate", newsId: twin.newsId, rejectionReason: "same_text" });
      await emitEvent(ctx.db, { code: "item.duplicate", itemId: item.id, sourceId: source.id, newsId: twin.newsId, data: { reason: "same_text" } });
      return "duplicate";
    }

    // Feeds often carry a one-line teaser: read the story page so the model sees the whole text, and the place.
    let body = item.body;
    if (settings.review.readArticles && source.kind === "rss" && item.url && item.body.length < ARTICLE_TEASER_CHARS) {
      const article = await fetchArticleText(item.url, { signal: ctx.signal, ...ctx.net });
      if (article && article.length > item.body.length) {
        body = article;
        await ctx.db.update(botItems).set({ body }).where(eq(botItems.id, item.id));
      }
    }

    const spent = await aiSpendToday(ctx.db, now(ctx));
    if (spent >= settings.ai.dailyBudgetUsd) {
      const tomorrow = new Date(utcDayStart(now(ctx)).getTime() + 24 * 3600 * 1000);
      await release(ctx, item, tomorrow);
      const day = tomorrow.toISOString().slice(0, 10);
      if (processing.state.budgetAnnounced !== day) {
        processing.state.budgetAnnounced = day;
        await emitEvent(ctx.db, { code: "ai.budget_reached", level: "warn", data: { spent, budget: settings.ai.dailyBudgetUsd } });
      }
      return "new";
    }

    // The provider refused calls earlier in this run (no credit, bad key, rate limit): wait, don't spend attempts.
    const paused = activePause(processing.state, settings, now(ctx));
    if (paused) {
      await release(ctx, item, new Date(paused.until));
      return "new";
    }

    const model = createModel(settings.ai.provider, settings.ai.model, ctx.keys);
    if (!model) {
      await release(ctx, item, new Date(now(ctx).getTime() + 30 * 60_000));
      if (!processing.state.missingKeyAnnounced) {
        processing.state.missingKeyAnnounced = true;
        await emitEvent(ctx.db, { code: "ai.failed", level: "error", message: `No API key for ${settings.ai.provider}` });
      }
      return "new";
    }

    let analyzed: AnalyzeResult;
    try {
      analyzed = await (ctx.analyze ?? analyzeEntry)({
        model,
        provider: settings.ai.provider,
        modelId: settings.ai.model,
        effort: settings.ai.effort,
        categories: processing.categories,
        source: { name: source.name, trust: source.trust },
        entry: { title: item.title, body, url: item.url, publishedAt: item.publishedAt },
        signal: ctx.signal,
      });
    } catch (error) {
      const refusal = providerRefusal(error);
      if (refusal && !ctx.signal?.aborted) {
        const until = new Date(now(ctx).getTime() + refusal.retryAfterMs);
        const announced = activePause(processing.state, settings, now(ctx));
        processing.state.aiPause = { kind: refusal.kind, message: refusal.message, provider: settings.ai.provider, model: settings.ai.model, until: until.toISOString() };
        await release(ctx, item, until);
        if (!announced) {
          await emitEvent(ctx.db, {
            code: "ai.paused",
            level: refusal.kind === "rate_limit" ? "warn" : "error",
            itemId: item.id,
            message: refusal.message,
            model: settings.ai.model,
            data: { kind: refusal.kind, provider: settings.ai.provider, until: until.toISOString() },
          });
        }
        return "new";
      }
      await emitEvent(ctx.db, { code: "ai.failed", level: "warn", itemId: item.id, sourceId: source.id, message: errorMessage(error), model: settings.ai.model });
      throw error;
    }
    const analysis = analyzed.analysis;
    await emitEvent(ctx.db, {
      code: "ai.call",
      itemId: item.id,
      sourceId: source.id,
      model: settings.ai.model,
      inputTokens: analyzed.usage?.inputTokens ?? null,
      outputTokens: analyzed.usage?.outputTokens ?? null,
      costUsd: estimateCost(analyzed.usage, settings.ai, now(ctx)),
      durationMs: analyzed.durationMs,
      data: { isIncident: analysis.isIncident, score: analysis.editorialScore, category: analysis.categoryKey },
    });

    // A story the model could only place in a region or the whole country does not belong on the map.
    const unplaceable = analysis.location.precision === "region" || analysis.location.precision === "country";
    if (!analysis.isIncident || unplaceable || analysis.editorialScore < settings.review.minScore) {
      const reason = !analysis.isIncident ? (analysis.rejectionReason ?? "not_incident") : unplaceable ? "no_location" : "low_score";
      await finish(ctx, item, { status: "rejected", rejectionReason: reason, analysis });
      await emitEvent(ctx.db, { code: "item.rejected", itemId: item.id, sourceId: source.id, data: { reason, score: analysis.editorialScore } });
      return "rejected";
    }

    let placed: Awaited<ReturnType<typeof locate>> | null = null;
    try {
      placed = await locate(ctx.geocoder, analysis.location, ctx.signal);
    } catch (error) {
      await emitEvent(ctx.db, { code: "geocode.failed", level: "warn", itemId: item.id, message: errorMessage(error) });
      throw error;
    }
    if (!placed.geocode && analysis.editorialScore < 0.7) {
      await finish(ctx, item, { status: "rejected", rejectionReason: "no_location", analysis });
      await emitEvent(ctx.db, { code: "item.no_location", itemId: item.id, sourceId: source.id, data: { mention: analysis.location.mention } });
      return "rejected";
    }

    const category = processing.categories.find((entry) => entry.key === analysis.categoryKey) ?? processing.categories[0];
    if (!category) throw new Error("No active categories");
    const occurredAt = analysis.occurredAt ? new Date(analysis.occurredAt) : (item.publishedAt ?? now(ctx));

    const subject: DedupeSubject = {
      title: analysis.title,
      summary: analysis.summary,
      url: item.url,
      categoryKey: category.key,
      occurredAt,
      latitude: placed.geocode?.latitude ?? null,
      longitude: placed.geocode?.longitude ?? null,
      province: placed.geocode?.province ?? analysis.location.province,
      district: placed.geocode?.district ?? analysis.location.district,
    };
    const decision = decideDedupe(subject, await loadDedupeCandidates(ctx.db, subject));

    if (decision.kind === "duplicate" && decision.target) {
      if (item.url) {
        await addCitation(ctx.db, decision.target.id, { url: item.url, title: item.title ?? analysis.title, publisherName: source.name, publishedAt: item.publishedAt, sourceId: source.id });
      }
      await finish(ctx, item, { status: "duplicate", newsId: decision.target.id, analysis, geocode: placed.geocode, rejectionReason: decision.reason });
      await emitEvent(ctx.db, { code: "item.duplicate", itemId: item.id, sourceId: source.id, newsId: decision.target.id, data: { score: decision.score } });
      return "duplicate";
    }

    const parentSuggestion: ParentSuggestion | null =
      decision.kind === "follow_up" && decision.target
        ? { newsId: decision.target.parentId ?? decision.target.id, relation: "update", confidence: decision.score, reason: decision.reason }
        : null;

    if (settings.dryRun) {
      await finish(ctx, item, { status: "rejected", rejectionReason: "dry_run", analysis, geocode: placed.geocode, parentSuggestion });
      await emitEvent(ctx.db, { code: "item.analyzed", itemId: item.id, sourceId: source.id, data: { dryRun: true, decision: decision.kind } });
      return "rejected";
    }

    const sensitive = analysis.isSensitive || category.isSensitive;
    const autoPublish =
      autoPublishActive(settings, now(ctx)) &&
      (settings.autoPublish.mode === "all" || source.autoPublish) &&
      Boolean(placed.geocode) &&
      !parentSuggestion &&
      analysis.editorialScore >= settings.autoPublish.minScore &&
      placed.confidence >= settings.autoPublish.minLocationConfidence &&
      precisionRank(placed.precision) <= precisionRank(settings.autoPublish.minPrecision) &&
      (!sensitive || settings.autoPublish.allowSensitive) &&
      (await publishedByBotToday(ctx)) < settings.autoPublish.dailyLimit;

    const imageUrl = item.media.find((media) => media.type === "image")?.url ?? null;
    const dedupeKey = `bot:${source.id}:${item.externalId}`.slice(0, 300);
    const story = await ctx.db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: news.id }).from(news).where(eq(news.dedupeKey, dedupeKey)).limit(1);
      if (existing) return { id: existing.id, created: false };
      const created = await createNews(tx, {
        origin: "bot",
        status: autoPublish ? "published" : "pending",
        title: analysis.title,
        summary: analysis.summary,
        content: analysis.content,
        categoryId: category.id,
        categorySensitive: category.isSensitive,
        location: {
          latitude: placed.geocode?.latitude ?? null,
          longitude: placed.geocode?.longitude ?? null,
          precision: placed.geocode ? placed.precision : "unknown",
          label: placed.label,
          mention: analysis.location.mention,
          province: placed.geocode?.province ?? analysis.location.province,
          district: placed.geocode?.district ?? analysis.location.district,
          neighborhood: analysis.location.neighborhood ?? placed.geocode?.neighborhood ?? null,
          street: analysis.location.street,
          confidence: placed.confidence,
          notes: analysis.location.evidence,
        },
        occurredAt,
        sourceId: source.id,
        sourceUrl: item.url,
        sourceExternalId: item.externalId,
        imageUrl,
        media: item.media,
        isSensitive: analysis.isSensitive,
        sensitivityType: analysis.sensitivityType,
        editorialScore: analysis.editorialScore,
        editorialConfidence: analysis.confidence,
        aiAnalysis: analysis,
        dedupeKey,
        suggestedParentId: parentSuggestion?.newsId ?? null,
        suggestedParentConfidence: parentSuggestion?.confidence ?? null,
        suggestedParentReason: parentSuggestion?.reason ?? null,
        citation: item.url ? { url: item.url, title: item.title ?? analysis.title, publisherName: source.name, publishedAt: item.publishedAt, sourceId: source.id } : undefined,
      });
      return { id: created.id, created: true };
    });

    const status = autoPublish ? "published" : "queued";
    await finish(ctx, item, { status, newsId: story.id, analysis, geocode: placed.geocode, parentSuggestion });
    await emitEvent(ctx.db, {
      code: autoPublish ? "item.published" : "item.queued",
      itemId: item.id,
      sourceId: source.id,
      newsId: story.id,
      data: { title: analysis.title, score: analysis.editorialScore, location: placed.label, followUp: Boolean(parentSuggestion) },
    });
    return status;
  } catch (error) {
    if (ctx.signal?.aborted) {
      await release(ctx, item, now(ctx));
      return "new";
    }
    await fail(ctx, item, error);
    return "failed";
  }
}

export async function processPending(ctx: BotContext, options: { limit?: number; state?: PassState } = {}) {
  const leased = await leaseItems(ctx, options.limit ?? 12);
  if (leased.length === 0) return { processed: 0, statuses: {} as Record<string, number> };
  const processing: ProcessingContext = { categories: await loadPromptCategories(ctx.db), state: options.state ?? {} };
  const statuses: Record<string, number> = {};
  await pool(leased, ctx.settings.ai.concurrency, async ({ item, source }) => {
    const status = await processItem(ctx, processing, item, source);
    statuses[status] = (statuses[status] ?? 0) + 1;
  });
  return { processed: leased.length, statuses };
}

/** Items put aside for later (AI paused, budget spent, key missing) become due now, e.g. after a settings change. */
export async function resumeWaitingItems(db: AppDatabase, at = new Date()) {
  const rows = await db
    .update(botItems)
    .set({ nextAttemptAt: at })
    .where(and(eq(botItems.status, "new"), gt(botItems.nextAttemptAt, at)))
    .returning({ id: botItems.id });
  return rows.length;
}

/* ------------------------------------------------------------------ maintenance */

/** Retention: raw bot items 90 days, events 30 days, view hashes 30 days, expired geocodes. */
export async function maintain(ctx: BotContext) {
  const at = now(ctx).getTime();
  const days = (count: number) => new Date(at - count * 24 * 3600 * 1000);
  // An item whose last allowed attempt died with its worker would otherwise stay "processing" forever.
  await ctx.db
    .update(botItems)
    .set({ status: "failed", lockedUntil: null, lastError: "Abandoned after the last attempt" })
    .where(and(eq(botItems.status, "processing"), lt(botItems.lockedUntil, now(ctx)), gte(botItems.attempts, MAX_ATTEMPTS)));
  const items = await ctx.db.delete(botItems).where(lt(botItems.createdAt, days(90))).returning({ id: botItems.id });
  const events = await ctx.db.delete(botEvents).where(lt(botEvents.createdAt, days(30))).returning({ id: botEvents.id });
  await ctx.db.delete(newsViews).where(lt(newsViews.day, days(30).toISOString().slice(0, 10)));
  await ctx.db.delete(geocodeCache).where(lt(geocodeCache.expiresAt, now(ctx)));
  return { items: items.length, events: events.length };
}

export type { BotAnalysis };
