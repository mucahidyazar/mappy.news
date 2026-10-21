import { APICallError } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AnalyzeResult } from "@/lib/bot/analyze";
import { activePause, type BotContext, collect, maintain, MAX_ATTEMPTS, type PassState, processPending, resumeWaitingItems } from "@/lib/bot/pipeline";
import { parseBotSettings } from "@/lib/bot/settings";
import { botEvents, botItems, news, newsCitations, sources } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/types";
import type { BotAnalysis } from "@/lib/domain/types";
import type { Geocoder } from "@/lib/geo/geocoder";

import { createTestDatabase } from "./helpers/db";

const NOW = new Date("2026-10-21T12:00:00Z");

function rss(items: Array<{ id: string; title: string; body: string }>) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>${items
    .map(
      (item) =>
        `<item><guid>${item.id}</guid><title>${item.title}</title><link>https://feed.example/${item.id}</link><pubDate>Tue, 21 Oct 2026 11:00:00 GMT</pubDate><description>${item.body}</description></item>`,
    )
    .join("")}</channel></rss>`;
}

function analysis(overrides: Partial<BotAnalysis> = {}): BotAnalysis {
  return {
    isIncident: true,
    rejectionReason: null,
    categoryKey: "fire_explosion",
    title: "Kadıköy Moda'da binada yangın",
    summary: "Moda'da 4 katlı bir binada yangın çıktı, 2 kişi dumandan etkilendi.",
    content: "Moda'da bir binada yangın çıktı.",
    occurredAt: null,
    location: { mention: "Kadıköy Moda", province: "İstanbul", district: "Kadıköy", neighborhood: "Caferağa", street: null, place: null, precision: "neighborhood", confidence: 0.9, evidence: "Metinde Moda geçiyor" },
    editorialScore: 0.85,
    confidence: 0.9,
    isSensitive: false,
    sensitivityType: null,
    keywords: ["yangın"],
    model: "test-model",
    promptVersion: "test",
    ...overrides,
  };
}

const geocoder: Geocoder = {
  async search(query) {
    if (!query.includes("Kadıköy")) return [];
    return [{ latitude: 40.9875, longitude: 29.0277, displayName: "Caferağa, Kadıköy, İstanbul", precision: "neighborhood", province: "İstanbul", district: "Kadıköy", neighborhood: "Caferağa", provider: "test", street: null, importance: 0.5, placeRank: 20 }];
  },
  async reverse() {
    return null;
  },
};

describe("news bot pipeline", () => {
  let db: AppDatabase;
  let close: () => Promise<void>;
  let feed = "";
  const analyses = new Map<string, BotAnalysis | Error>();
  const articles = new Map<string, string>();
  const analyzedBodies = new Map<string, string>();
  let analyzeCalls = 0;

  function context(settings: Record<string, unknown> = {}): BotContext {
    return {
      db,
      settings: parseBotSettings({ enabled: true, ...settings }),
      geocoder,
      keys: { openai: "test-key", deepseek: "test-key" },
      now: () => NOW,
      net: {
        fetchImpl: (async (input: string | URL) => {
          const url = String(input);
          const article = articles.get(url);
          if (article) return new Response(article, { headers: { "content-type": "text/html; charset=utf-8" } });
          if (url.endsWith(".xml")) return new Response(feed, { headers: { "content-type": "application/rss+xml" } });
          return new Response("Not found", { status: 404, headers: { "content-type": "text/html" } });
        }) as typeof fetch,
        resolve: async () => ["93.184.216.34"],
      },
      analyze: async (input): Promise<AnalyzeResult> => {
        analyzeCalls += 1;
        analyzedBodies.set(input.entry.title ?? "", input.entry.body);
        const result = analyses.get(input.entry.title ?? "");
        if (result instanceof Error) throw result;
        return { analysis: result ?? analysis({ isIncident: false, rejectionReason: "test default" }), usage: { inputTokens: 1000, outputTokens: 200 } as AnalyzeResult["usage"], durationMs: 5 };
      },
    };
  }

  async function addSource(name: string, overrides: Partial<typeof sources.$inferInsert> = {}) {
    const [source] = await db
      .insert(sources)
      .values({ kind: "rss", name, url: `https://feed.example/${name}.xml`, trust: "media", nextPollAt: new Date("2026-10-21T00:00:00Z"), ...overrides })
      .returning();
    return source!;
  }

  async function item(externalId: string) {
    const [row] = await db.select().from(botItems).where(eq(botItems.externalId, externalId));
    return row!;
  }

  beforeAll(async () => {
    ({ db, close } = await createTestDatabase());
  });

  afterAll(async () => {
    await close();
  });

  it("collects feed entries once and runs them through screening, analysis and the review queue", async () => {
    const source = await addSource("first");
    feed = rss([
      { id: "fire", title: "Kadıköy'de yangın", body: "Moda'da 4 katlı binada yangın çıktı, itfaiye ekipleri müdahale ediyor." },
      { id: "concert", title: "Belediyeden konser", body: "Belediye hafta sonu parkta ücretsiz bir konser düzenleyecek." },
      { id: "report", title: "Kaza istatistikleri açıklandı", body: "Ekim ayında ilde 300 trafik kazası yaşandığı açıklandı." },
    ]);
    analyses.set("Kadıköy'de yangın", analysis());
    analyses.set("Kaza istatistikleri açıklandı", analysis({ isIncident: false, rejectionReason: "İstatistik haberi" }));

    expect(await collect(context())).toEqual({ sources: 1, stored: 3 });
    // Leased sources move on to their next poll time; polling again by id stores nothing new.
    expect(await collect(context())).toEqual({ sources: 0, stored: 0 });
    expect(await collect(context(), { sourceId: source.id })).toEqual({ sources: 1, stored: 0 });

    const result = await processPending(context());
    expect(result).toEqual({ processed: 3, statuses: { queued: 1, screened_out: 1, rejected: 1 } });
    expect(analyzeCalls).toBe(2);

    expect(await item("concert")).toMatchObject({ status: "screened_out", rejectionReason: "no_keywords", lockedUntil: null });
    expect(await item("report")).toMatchObject({ status: "rejected", rejectionReason: "İstatistik haberi" });

    const fire = await item("fire");
    expect(fire).toMatchObject({ status: "queued", attempts: 1 });
    const [story] = await db.select().from(news).where(eq(news.id, fire.newsId!));
    expect(story).toMatchObject({ status: "pending", origin: "bot", title: "Kadıköy Moda'da binada yangın", district: "Kadıköy", precision: "neighborhood", citationCount: 1, sourceUrl: "https://feed.example/fire", publishedAt: null });
    expect(story!.dedupeKey).toBe(`bot:${source.id}:fire`);

    const codes = (await db.select({ code: botEvents.code }).from(botEvents)).map((event) => event.code);
    expect(codes).toEqual(expect.arrayContaining(["source.polled", "item.screened_out", "ai.call", "item.rejected", "item.queued"]));
  });

  it("cites a copy of the same text from another feed instead of creating a story", async () => {
    await addSource("second");
    feed = rss([{ id: "fire-copy", title: "Kadıköy'de yangın", body: "Moda'da 4 katlı binada yangın çıktı, itfaiye ekipleri müdahale ediyor." }]);
    await collect(context());
    const calls = analyzeCalls;
    expect((await processPending(context())).statuses).toEqual({ duplicate: 1 });
    expect(analyzeCalls).toBe(calls);

    const copy = await item("fire-copy");
    const original = await item("fire");
    expect(copy).toMatchObject({ status: "duplicate", rejectionReason: "same_text", newsId: original.newsId });
    const citations = await db.select().from(newsCitations).where(eq(newsCitations.newsId, original.newsId!));
    expect(citations.map((citation) => citation.url).sort()).toEqual(["https://feed.example/fire", "https://feed.example/fire-copy"]);
    const [story] = await db.select({ citationCount: news.citationCount }).from(news).where(eq(news.id, original.newsId!));
    expect(story?.citationCount).toBe(2);
  });

  it("merges another outlet's report of the same incident and publishes trusted sources automatically", async () => {
    await addSource("third", { autoPublish: true });
    feed = rss([
      { id: "fire-other", title: "Moda'daki yangın", body: "Kadıköy Moda'daki binada çıkan yangında iki kişi dumandan etkilendi." },
      { id: "crash", title: "Kadıköy'de kaza", body: "Kadıköy'de iki otomobil çarpıştı, 3 kişi yaralandı." },
    ]);
    analyses.set("Moda'daki yangın", analysis({ title: "Moda'da binada yangın", summary: "Kadıköy Moda'daki 4 katlı binada yangın çıktı; 2 kişi dumandan etkilendi." }));
    analyses.set("Kadıköy'de kaza", analysis({ categoryKey: "traffic_incidents", title: "Kadıköy'de iki otomobil çarpıştı: 3 yaralı", summary: "Kadıköy'de iki otomobilin çarpıştığı kazada 3 kişi yaralandı.", keywords: ["kaza"] }));
    await collect(context());

    const result = await processPending(context({ autoPublish: { mode: "trusted", minScore: 0.8, minLocationConfidence: 0.8 } }));
    expect(result.statuses).toEqual({ duplicate: 1, published: 1 });

    expect(await item("fire-other")).toMatchObject({ status: "duplicate", rejectionReason: "same_incident", newsId: (await item("fire")).newsId });
    const crash = await item("crash");
    expect(crash.status).toBe("published");
    const [story] = await db.select().from(news).where(eq(news.id, crash.newsId!));
    expect(story).toMatchObject({ status: "published", origin: "bot" });
    expect(story!.publishedAt).toBeInstanceOf(Date);
  });

  it("pauses analysis when the daily AI budget is spent", async () => {
    await db.insert(botEvents).values({ code: "ai.call", costUsd: 5, createdAt: new Date("2026-10-21T08:00:00Z") });
    await addSource("fourth");
    feed = rss([{ id: "late-fire", title: "Üsküdar'da yangın", body: "Üsküdar'da bir iş yerinde yangın çıktı, itfaiye müdahale ediyor." }]);
    await collect(context());

    expect((await processPending(context())).statuses).toEqual({ new: 1 });
    const late = await item("late-fire");
    expect(late).toMatchObject({ status: "new", attempts: 0, lockedUntil: null });
    expect(late.nextAttemptAt.toISOString()).toBe("2026-10-22T00:00:00.000Z");
    const [event] = await db.select().from(botEvents).where(eq(botEvents.code, "ai.budget_reached"));
    expect(event?.level).toBe("warn");
    await db.delete(botEvents).where(and(eq(botEvents.code, "ai.call"), eq(botEvents.costUsd, 5)));
    await db.delete(botItems).where(eq(botItems.externalId, "late-fire"));
  });

  it("retries failed analyses with a backoff and gives up after the last attempt", async () => {
    await addSource("fifth");
    feed = rss([{ id: "flaky", title: "Beşiktaş'ta kaza", body: "Beşiktaş'ta bir otomobil yayaya çarptı, yaralı hastaneye kaldırıldı." }]);
    analyses.set("Beşiktaş'ta kaza", new Error("model overloaded"));
    await collect(context());

    expect((await processPending(context())).statuses).toEqual({ failed: 1 });
    const failed = await item("flaky");
    expect(failed).toMatchObject({ status: "failed", attempts: 1, lastError: "model overloaded", lockedUntil: null });
    expect(failed.nextAttemptAt.toISOString()).toBe("2026-10-21T12:05:00.000Z");
    // Not due yet.
    expect((await processPending(context())).processed).toBe(0);

    // A worker that died during the last allowed attempt leaves the item "processing"; maintenance fails it.
    await db.update(botItems).set({ status: "processing", attempts: MAX_ATTEMPTS, lockedUntil: new Date("2026-10-21T11:00:00Z") }).where(eq(botItems.id, failed.id));
    await maintain(context());
    expect(await item("flaky")).toMatchObject({ status: "failed", lockedUntil: null, lastError: "Abandoned after the last attempt" });
  });

  it("holds analyses without using attempts when the provider has no credit, and resumes on demand", async () => {
    await addSource("sixth");
    feed = rss([
      { id: "no-credit-1", title: "Şişli'de yangın", body: "Şişli'de bir iş yerinde yangın çıktı, itfaiye ekipleri müdahale ediyor." },
      { id: "no-credit-2", title: "Sarıyer'de kaza", body: "Sarıyer sahil yolunda iki otomobil çarpıştı, 2 kişi yaralandı." },
    ]);
    const refusal = new APICallError({ message: "Insufficient Balance", url: "https://api.deepseek.com/chat/completions", requestBodyValues: {}, statusCode: 402, isRetryable: false });
    analyses.set("Şişli'de yangın", refusal);
    analyses.set("Sarıyer'de kaza", refusal);
    await collect(context());

    const state: PassState = {};
    const settings = { ai: { provider: "deepseek", model: "deepseek-flash" } };
    const calls = analyzeCalls;
    expect((await processPending(context(settings), { state, limit: 1 })).statuses).toEqual({ new: 1 });
    expect(state.aiPause).toMatchObject({ kind: "quota", provider: "deepseek", model: "deepseek-flash", until: "2026-10-21T13:00:00.000Z" });
    // The second item waits for the pause without another call.
    await db.update(botItems).set({ nextAttemptAt: NOW }).where(eq(botItems.externalId, "no-credit-2"));
    expect((await processPending(context(settings), { state })).statuses).toEqual({ new: 1 });
    expect(analyzeCalls).toBe(calls + 1);

    for (const id of ["no-credit-1", "no-credit-2"]) {
      expect(await item(id)).toMatchObject({ status: "new", attempts: 0, nextAttemptAt: new Date("2026-10-21T13:00:00.000Z") });
    }
    const paused = await db.select().from(botEvents).where(eq(botEvents.code, "ai.paused"));
    expect(paused).toHaveLength(1);
    expect(paused[0]).toMatchObject({ level: "error", message: "Insufficient Balance" });

    // Another provider or model is not affected by the pause.
    expect(activePause(state, parseBotSettings({ ai: { provider: "openai", model: "gpt-6-luna" } }), NOW)).toBeNull();
    // Topping up and saving the settings (or "Scan now") makes the held items due again.
    expect(await resumeWaitingItems(db, NOW)).toBe(2);
    await db.delete(botItems).where(inArray(botItems.externalId, ["no-credit-1", "no-credit-2"]));
  });

  it("reads the story page when the feed only carries a teaser", async () => {
    await addSource("seventh");
    feed = rss([{ id: "teaser", title: "Zonguldak'ta bina çöktü", body: "Zonguldak'ta çöken binanın enkazında kalan 1 kişi hayatını kaybetti." }]);
    const fullText = "Zonguldak'ın Kilimli ilçesi Çatalağzı Mahallesi'nde 3 katlı bir bina sabah saatlerinde çöktü. Enkaz altında kalan iki kişiden biri kurtarıldı. ".repeat(3).trim();
    articles.set("https://feed.example/teaser", `<html><head><script type="application/ld+json">{"@type":"NewsArticle","articleBody":"${fullText}"}</script></head><body></body></html>`);
    analyses.set("Zonguldak'ta bina çöktü", analysis({ isIncident: false, rejectionReason: "test" }));
    await collect(context());
    await processPending(context());

    expect(analyzedBodies.get("Zonguldak'ta bina çöktü")).toBe(fullText);
    expect((await item("teaser")).body).toBe(fullText);

    // Switched off, the teaser is analysed as it is.
    feed = rss([{ id: "teaser-2", title: "Kilimli'de ikinci çökme", body: "Kilimli'de çöken binanın enkazında kalan 1 kişi kurtarıldı." }]);
    articles.set("https://feed.example/teaser-2", `<article><p>${fullText}</p></article>`);
    await collect(context(), { sourceId: (await item("teaser")).sourceId });
    await processPending(context({ review: { readArticles: false } }));
    expect(analyzedBodies.get("Kilimli'de ikinci çökme")).toBe("Kilimli'de çöken binanın enkazında kalan 1 kişi kurtarıldı.");
  });

  it("backs off failing sources", async () => {
    const source = await addSource("broken");
    feed = "<html>not a feed</html>";
    await collect(context(), { sourceId: source.id });
    const [row] = await db.select().from(sources).where(eq(sources.id, source.id));
    expect(row).toMatchObject({ failStreak: 1, lastError: "Not an RSS or Atom feed" });
    expect(row!.nextPollAt.getTime()).toBe(NOW.getTime() + 30 * 60_000);
  });
});
