import "server-only";

import { and, asc, between, desc, eq, gte, ilike, inArray, isNotNull, lte, ne, or, type SQL, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { categories, news, newsCitations, newsViews, sources, user } from "@/lib/db/schema";
import { isMorePrecise } from "@/lib/domain/location";
import { boundingBox } from "@/lib/domain/location";
import { foldTurkish } from "@/lib/domain/text";
import { type MapQuery, resolveRange } from "@/lib/news/filters";
import type { CategoryDTO, MapNewsItem, MapNewsResponse, NewsDetail, NewsTimelineEntry } from "@/lib/news/types";

const MAP_LIMIT = 1500;

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function searchConditions(query: string | undefined): SQL[] {
  if (!query) return [];
  return foldTurkish(query)
    .split(/\s+/)
    .filter((term) => term.length > 1)
    .slice(0, 5)
    .map((term) => ilike(news.searchText, `%${escapeLike(term)}%`));
}

const hasFollowUps = sql<boolean>`exists (
  select 1 from ${news} as follow_up
  where follow_up.parent_id = ${news.id} and follow_up.status = 'published'
)`;

// An incident's toll is the highest any of its published reports gives (GREATEST and MAX ignore NULL).
const incidentDeaths = sql<number | null>`greatest(${news.deaths}, (
  select max(follow_up.deaths) from ${news} as follow_up
  where follow_up.parent_id = ${news.id} and follow_up.status = 'published'
))`;
const incidentInjured = sql<number | null>`greatest(${news.injured}, (
  select max(follow_up.injured) from ${news} as follow_up
  where follow_up.parent_id = ${news.id} and follow_up.status = 'published'
))`;

/** Published stories with a public position in the requested window, newest first. */
export async function listMapNews(query: MapQuery): Promise<MapNewsResponse> {
  const { from, to } = resolveRange(query.range, query.from, query.to);
  const conditions: SQL[] = [
    eq(news.status, "published"),
    isNotNull(news.publicLatitude),
    isNotNull(news.publicLongitude),
    gte(news.occurredAt, from),
    lte(news.occurredAt, to),
    ...searchConditions(query.q),
  ];
  if (query.c.length) conditions.push(inArray(categories.key, query.c));
  if (query.source) conditions.push(eq(news.sourceId, query.source));
  if (query.bbox) {
    conditions.push(between(news.publicLatitude, query.bbox.south, query.bbox.north));
    conditions.push(between(news.publicLongitude, query.bbox.west, query.bbox.east));
  }

  const rows = await db
    .select({
      id: news.id,
      slug: news.slug,
      title: news.title,
      summary: news.summary,
      categoryKey: categories.key,
      latitude: news.publicLatitude,
      longitude: news.publicLongitude,
      precision: news.publicPrecision,
      locationLabel: news.locationLabel,
      occurredAt: news.occurredAt,
      publishedAt: news.publishedAt,
      sourceName: sources.name,
      citationCount: news.citationCount,
      commentCount: news.commentCount,
      imageUrl: news.imageUrl,
      isSensitive: news.isSensitive,
      hasFollowUps,
      deaths: incidentDeaths,
      injured: incidentInjured,
      rootId: sql<string>`coalesce(${news.parentId}, ${news.id})`,
    })
    .from(news)
    .innerJoin(categories, eq(news.categoryId, categories.id))
    .leftJoin(sources, eq(news.sourceId, sources.id))
    .where(and(...conditions))
    .orderBy(desc(news.occurredAt))
    .limit(MAP_LIMIT + 1);

  const items: MapNewsItem[] = rows.slice(0, MAP_LIMIT).map((row) => ({
    ...row,
    latitude: row.latitude!,
    longitude: row.longitude!,
    summary: row.summary ? row.summary.slice(0, 280) : null,
    occurredAt: row.occurredAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    hasFollowUps: Boolean(row.hasFollowUps),
  }));
  return { items, truncated: rows.length > MAP_LIMIT };
}

function toCategoryDTO(category: typeof categories.$inferSelect): CategoryDTO {
  return {
    id: category.id,
    key: category.key,
    nameTr: category.nameTr,
    nameEn: category.nameEn,
    color: category.color,
    icon: category.icon,
    isSensitive: category.isSensitive,
    sortOrder: category.sortOrder,
  };
}

async function loadTimeline(rootId: string, currentId: string, includeUnpublished: boolean) {
  const rows = await db
    .select({ id: news.id, slug: news.slug, title: news.title, relation: news.relation, occurredAt: news.occurredAt, deaths: news.deaths, injured: news.injured })
    .from(news)
    .where(
      and(
        or(eq(news.id, rootId), eq(news.parentId, rootId)),
        includeUnpublished ? undefined : eq(news.status, "published"),
      ),
    )
    .orderBy(asc(news.occurredAt));
  const entries: NewsTimelineEntry[] =
    rows.length < 2
      ? []
      : rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          relation: row.id === rootId ? null : row.relation,
          occurredAt: row.occurredAt.toISOString(),
          isCurrent: row.id === currentId,
        }));
  return { entries, tolls: rows.map((row) => ({ deaths: row.deaths, injured: row.injured })) };
}

/** The highest count any report gives; null when none gives one. */
function highest(values: Array<number | null>) {
  const known = values.filter((value): value is number => value != null);
  return known.length ? Math.max(...known) : null;
}

/** A story page. Unpublished stories are only returned for staff previews. */
export async function getNewsBySlug(slug: string, options: { includeUnpublished?: boolean } = {}): Promise<NewsDetail | null> {
  const row = await db.query.news.findFirst({
    where: eq(news.slug, slug),
    with: {
      category: true,
      source: { columns: { id: true, name: true, homepageUrl: true, trust: true } },
      submittedBy: { columns: { id: true, name: true, image: true } },
      citations: { orderBy: asc(newsCitations.publishedAt) },
    },
  });
  if (!row) return null;
  if (row.status !== "published" && !options.includeUnpublished) return null;

  const timeline = await loadTimeline(row.parentId ?? row.id, row.id, Boolean(options.includeUnpublished));
  const tolls = [...timeline.tolls, { deaths: row.deaths, injured: row.injured }];
  const deaths = highest(tolls.map((toll) => toll.deaths));
  const injured = highest(tolls.map((toll) => toll.injured));
  const verificationOpen = !row.isSensitive && !row.category.isSensitive && !isMorePrecise(row.precision, "neighborhood");

  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    origin: row.origin,
    title: row.title,
    summary: row.summary,
    content: row.content,
    category: toCategoryDTO(row.category),
    locationLabel: row.locationLabel,
    precision: row.publicPrecision,
    latitude: row.publicLatitude,
    longitude: row.publicLongitude,
    occurredAt: row.occurredAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    imageUrl: row.imageUrl,
    sourceUrl: row.sourceUrl,
    source: row.source,
    submittedBy: row.origin === "user" ? row.submittedBy : null,
    autoPublished: row.origin === "bot" && !row.reviewedById,
    isSensitive: row.isSensitive || row.category.isSensitive,
    viewCount: row.viewCount,
    commentCount: row.commentCount,
    citations: row.citations.map((citation) => ({
      id: citation.id,
      url: citation.url,
      title: citation.title,
      publisherName: citation.publisherName,
      publishedAt: citation.publishedAt?.toISOString() ?? null,
    })),
    timeline: timeline.entries,
    verificationOpen,
    casualties: { deaths, injured, fromUpdates: deaths !== row.deaths || injured !== row.injured },
  };
}

/** Other recent stories within ~25 km, for the "nearby" list on a story page. */
export async function listNearbyNews(target: { id: string; latitude: number | null; longitude: number | null }, limit = 4) {
  if (target.latitude == null || target.longitude == null) return [];
  const box = boundingBox(target.latitude, target.longitude, 25);
  return db
    .select({
      id: news.id,
      slug: news.slug,
      title: news.title,
      locationLabel: news.locationLabel,
      occurredAt: news.occurredAt,
      categoryKey: categories.key,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(news)
    .innerJoin(categories, eq(news.categoryId, categories.id))
    .where(
      and(
        eq(news.status, "published"),
        ne(news.id, target.id),
        between(news.publicLatitude, box.south, box.north),
        between(news.publicLongitude, box.west, box.east),
      ),
    )
    .orderBy(desc(news.occurredAt))
    .limit(limit);
}

/** Counts one view per visitor and day without storing addresses. */
export async function recordView(newsId: string, visitorHash: string) {
  const day = new Date().toISOString().slice(0, 10);
  const inserted = await db
    .insert(newsViews)
    .values({ newsId, day, visitorHash })
    .onConflictDoNothing()
    .returning({ newsId: newsViews.newsId });
  if (inserted.length) {
    await db
      .update(news)
      .set({ viewCount: sql`${news.viewCount} + 1` })
      .where(eq(news.id, newsId));
  }
}

export async function listSitemapNews(limit = 5000) {
  return db
    .select({ slug: news.slug, updatedAt: news.updatedAt })
    .from(news)
    .where(eq(news.status, "published"))
    .orderBy(desc(news.publishedAt))
    .limit(limit);
}

export async function getPublicStats() {
  const [row] = await db
    .select({
      published: sql<number>`count(*) filter (where ${news.status} = 'published')::int`,
      last24h: sql<number>`count(*) filter (where ${news.status} = 'published' and ${news.occurredAt} > now() - interval '24 hours')::int`,
      contributors: sql<number>`(select count(*)::int from ${user})`,
    })
    .from(news);
  return row ?? { published: 0, last24h: 0, contributors: 0 };
}
