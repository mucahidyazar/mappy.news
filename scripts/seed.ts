/**
 * Idempotent seed: categories, default RSS sources, X accounts from SEED_X_ACCOUNTS and bot settings.
 *
 *   pnpm db:seed                      reference data only (safe in production; never overwrites admin edits)
 *   pnpm db:seed --demo               plus sample published stories for local development
 *   pnpm db:seed --reset-categories   restore the default names, colors, icons and bot hints of categories
 */
import "./load-env";

import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { BOT_SETTINGS_KEY, DEFAULT_BOT_SETTINGS } from "../src/lib/bot/settings";
import * as schema from "../src/lib/db/schema";
import { CATEGORY_SEEDS, RSS_SOURCE_SEEDS } from "../src/lib/domain/seed-data";
import { DEMO_STORIES } from "./demo-stories";
import { createNews } from "../src/lib/news/write";

const { appSettings, categories, news, sources } = schema;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });

  try {
    // Categories are edited in the admin panel; the seed only adds missing ones unless told to reset them.
    const resetCategories = process.argv.includes("--reset-categories");
    let addedCategories = 0;
    for (const [index, category] of CATEGORY_SEEDS.entries()) {
      const insert = db.insert(categories).values({ ...category, sortOrder: index });
      const rows = await (resetCategories
        ? insert.onConflictDoUpdate({
            target: categories.key,
            set: {
              nameTr: category.nameTr,
              nameEn: category.nameEn,
              color: category.color,
              icon: category.icon,
              isSensitive: category.isSensitive,
              aiHint: category.aiHint,
              sortOrder: index,
            },
          })
        : insert.onConflictDoNothing()
      ).returning({ id: categories.id });
      addedCategories += rows.length;
    }
    console.log(`[seed] categories: ${resetCategories ? `${CATEGORY_SEEDS.length} reset to defaults` : `${addedCategories} added`}`);

    let addedSources = 0;
    for (const source of RSS_SOURCE_SEEDS) {
      const inserted = await db.insert(sources).values(source).onConflictDoNothing().returning({ id: sources.id });
      addedSources += inserted.length;
    }

    const handles = (process.env.SEED_X_ACCOUNTS ?? "")
      .split(",")
      .map((handle) => handle.trim().replace(/^@+/, "").toLowerCase())
      .filter((handle) => /^[a-z0-9_]{1,15}$/.test(handle));
    for (const handle of handles) {
      const inserted = await db
        .insert(sources)
        .values({
          kind: "x",
          name: `@${handle}`,
          handle,
          url: `https://x.com/${handle}`,
          homepageUrl: `https://x.com/${handle}`,
          trust: "official",
          pollIntervalMinutes: 30,
          maxItemsPerPoll: 10,
        })
        .onConflictDoNothing()
        .returning({ id: sources.id });
      addedSources += inserted.length;
    }
    console.log(`[seed] ${addedSources} new sources`);

    await db.insert(appSettings).values({ key: BOT_SETTINGS_KEY, value: DEFAULT_BOT_SETTINGS }).onConflictDoNothing();

    if (process.argv.includes("--demo")) {
      if (process.env.NODE_ENV === "production") throw new Error("Refusing to load demo stories in production");
      const categoryRows = await db.select({ id: categories.id, key: categories.key, isSensitive: categories.isSensitive }).from(categories);
      const byKey = new Map(categoryRows.map((row) => [row.key, row]));
      let created = 0;
      for (const story of DEMO_STORIES) {
        const category = byKey.get(story.categoryKey);
        if (!category) continue;
        const [existing] = await db
          .select({ id: news.id })
          .from(news)
          .where(and(eq(news.title, story.title), eq(news.origin, "admin")))
          .limit(1);
        if (existing) continue;
        await createNews(db, {
          origin: "admin",
          status: "published",
          title: story.title,
          summary: story.summary,
          content: story.summary,
          categoryId: category.id,
          categorySensitive: category.isSensitive,
          location: {
            latitude: story.latitude,
            longitude: story.longitude,
            precision: story.precision,
            province: story.province,
            district: story.district ?? null,
            neighborhood: story.neighborhood ?? null,
            confidence: 0.9,
          },
          occurredAt: new Date(Date.now() - story.hoursAgo * 3600 * 1000),
          sourceUrl: story.sourceUrl ?? null,
          citation: story.sourceUrl ? { url: story.sourceUrl, publisherName: story.publisher ?? null } : undefined,
        });
        created += 1;
      }
      const [{ count } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(news);
      console.log(`[seed] ${created} demo stories added (${count} stories in total)`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("[seed] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
