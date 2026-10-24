import { and, eq, sql } from "drizzle-orm";

import { categories, news, newsCitations, userProfiles } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/types";
import { type LocationPrecision, type NewsOrigin, type NewsRelation, POINTS } from "@/lib/domain/constants";
import { formatLocationLabel, publicLocation } from "@/lib/domain/location";
import { newsSlug, searchText } from "@/lib/domain/text";
import type { BotAnalysis, Casualties, NewsMedia } from "@/lib/domain/types";
import { awardPoints } from "@/lib/points";

export interface NewsLocationFields {
  latitude: number | null;
  longitude: number | null;
  precision: LocationPrecision;
  label?: string | null;
  mention?: string | null;
  province?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  confidence?: number | null;
  notes?: string | null;
}

/** Derives the stored location columns, including the privacy-adjusted public position. */
export function locationColumns(location: NewsLocationFields, sensitive: boolean) {
  const shown = publicLocation({
    latitude: location.latitude,
    longitude: location.longitude,
    precision: location.precision,
    sensitive,
  });
  const areaLabel = formatLocationLabel({ neighborhood: location.neighborhood, district: location.district, province: location.province });
  return {
    // A sensitive story's label never names the street or building, only the area.
    locationLabel: sensitive ? areaLabel : location.label?.trim() || areaLabel,
    locationMention: location.mention ?? null,
    province: location.province ?? null,
    district: location.district ?? null,
    neighborhood: location.neighborhood ?? null,
    // A sensitive story never stores a street in the public row.
    street: sensitive ? null : (location.street ?? null),
    precision: location.precision,
    locationConfidence: location.confidence ?? null,
    latitude: location.latitude,
    longitude: location.longitude,
    publicLatitude: shown?.latitude ?? null,
    publicLongitude: shown?.longitude ?? null,
    publicPrecision: shown?.precision ?? "unknown",
    locationNotes: location.notes ?? null,
  } as const;
}

export interface CreateNewsInput {
  origin: NewsOrigin;
  status: "pending" | "published";
  title: string;
  summary?: string | null;
  content?: string | null;
  categoryId: string;
  categorySensitive: boolean;
  location: NewsLocationFields;
  occurredAt: Date;
  sourceId?: string | null;
  sourceUrl?: string | null;
  sourceExternalId?: string | null;
  imageUrl?: string | null;
  media?: NewsMedia[];
  isSensitive?: boolean;
  sensitivityType?: string | null;
  editorialScore?: number | null;
  editorialConfidence?: number | null;
  aiAnalysis?: BotAnalysis | null;
  casualties?: Casualties | null;
  dedupeKey?: string | null;
  /** An update of an earlier incident: the root story it belongs to. */
  parentId?: string | null;
  relation?: NewsRelation | null;
  submittedById?: string | null;
  reviewedById?: string | null;
  suggestedParentId?: string | null;
  suggestedParentConfidence?: number | null;
  suggestedParentReason?: string | null;
  citation?: { url: string; title?: string | null; publisherName?: string | null; publishedAt?: Date | null; sourceId?: string | null };
}

export async function createNews(tx: DbExecutor, input: CreateNewsInput) {
  const sensitive = Boolean(input.isSensitive) || input.categorySensitive;
  const location = locationColumns(input.location, sensitive);
  const now = new Date();
  const [created] = await tx
    .insert(news)
    .values({
      slug: newsSlug(input.title),
      status: input.status,
      origin: input.origin,
      title: input.title,
      summary: input.summary ?? null,
      content: input.content ?? null,
      categoryId: input.categoryId,
      ...location,
      occurredAt: input.occurredAt,
      publishedAt: input.status === "published" ? now : null,
      sourceId: input.sourceId ?? null,
      sourceUrl: input.sourceUrl ?? null,
      sourceExternalId: input.sourceExternalId ?? null,
      imageUrl: input.imageUrl ?? null,
      media: input.media ?? [],
      isSensitive: Boolean(input.isSensitive),
      sensitivityType: input.sensitivityType ?? null,
      editorialScore: input.editorialScore ?? null,
      editorialConfidence: input.editorialConfidence ?? null,
      aiAnalysis: input.aiAnalysis ?? null,
      deaths: input.casualties?.deaths ?? null,
      injured: input.casualties?.injured ?? null,
      dedupeKey: input.dedupeKey ?? null,
      parentId: input.parentId ?? null,
      relation: input.parentId ? (input.relation ?? "update") : null,
      submittedById: input.submittedById ?? null,
      reviewedById: input.reviewedById ?? null,
      reviewedAt: input.reviewedById ? now : null,
      suggestedParentId: input.suggestedParentId ?? null,
      suggestedParentConfidence: input.suggestedParentConfidence ?? null,
      suggestedParentReason: input.suggestedParentReason ?? null,
      citationCount: input.citation ? 1 : 0,
      searchText: searchText(input.title, input.summary, location.locationLabel, input.location.mention),
    })
    .returning({ id: news.id, slug: news.slug });
  if (!created) throw new Error("News insert returned no row");

  if (input.citation) {
    await tx
      .insert(newsCitations)
      .values({
        newsId: created.id,
        sourceId: input.citation.sourceId ?? input.sourceId ?? null,
        url: input.citation.url,
        title: input.citation.title ?? null,
        publisherName: input.citation.publisherName ?? null,
        publishedAt: input.citation.publishedAt ?? null,
      })
      .onConflictDoNothing();
  }
  return created;
}

/** Adds another outlet's report to an existing story; returns false if that link was already cited. */
export async function addCitation(
  tx: DbExecutor,
  newsId: string,
  citation: { url: string; title?: string | null; publisherName?: string | null; publishedAt?: Date | null; sourceId?: string | null },
) {
  const inserted = await tx
    .insert(newsCitations)
    .values({
      newsId,
      sourceId: citation.sourceId ?? null,
      url: citation.url,
      title: citation.title ?? null,
      publisherName: citation.publisherName ?? null,
      publishedAt: citation.publishedAt ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: newsCitations.id });
  if (inserted.length === 0) return false;
  await tx
    .update(news)
    .set({ citationCount: sql`${news.citationCount} + 1` })
    .where(eq(news.id, newsId));
  return true;
}

/**
 * Another report of the same incident: its counts replace the story's where they are higher. Tolls rise as an
 * incident unfolds; an editor corrects the rare downward revision by hand.
 */
export async function raiseCasualties(tx: DbExecutor, newsId: string, casualties: Casualties | null | undefined) {
  if (casualties?.deaths == null && casualties?.injured == null) return;
  // GREATEST ignores NULL: a count arriving for an unknown one is simply taken.
  await tx
    .update(news)
    .set({
      ...(casualties.deaths != null ? { deaths: sql`greatest(${news.deaths}, ${casualties.deaths})` } : {}),
      ...(casualties.injured != null ? { injured: sql`greatest(${news.injured}, ${casualties.injured})` } : {}),
    })
    .where(eq(news.id, newsId));
}

/**
 * Publishes a pending story. A reader's report earns its author points once. Returns null when the story is
 * not pending anymore (another editor acted first).
 */
export async function publishPendingNews(tx: DbExecutor, newsId: string, reviewerId: string | null, note?: string | null) {
  const now = new Date();
  const [published] = await tx
    .update(news)
    .set({ status: "published", publishedAt: now, reviewedById: reviewerId, reviewedAt: now, reviewNote: note ?? null })
    .where(and(eq(news.id, newsId), eq(news.status, "pending")))
    .returning({ id: news.id, slug: news.slug, origin: news.origin, submittedById: news.submittedById, latitude: news.publicLatitude });
  if (!published) return null;
  if (published.origin === "user" && published.submittedById) {
    const awarded = await awardPoints(tx, {
      userId: published.submittedById,
      action: "report_published",
      amount: POINTS.reportPublished,
      referenceId: published.id,
      note: "report_published",
    });
    if (awarded) {
      await tx
        .update(userProfiles)
        .set({ publishedReportCount: sql`${userProfiles.publishedReportCount} + 1` })
        .where(eq(userProfiles.userId, published.submittedById));
    }
  }
  return published;
}

export async function findCategoryByKey(tx: DbExecutor, key: string) {
  const [category] = await tx
    .select({ id: categories.id, key: categories.key, isSensitive: categories.isSensitive, isActive: categories.isActive })
    .from(categories)
    .where(eq(categories.key, key))
    .limit(1);
  return category ?? null;
}
