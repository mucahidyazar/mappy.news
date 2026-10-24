import "server-only";

import { and, asc, between, desc, eq, gte, ilike, ne, or, type SQL, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { categories, news, newsCitations, sources, user } from "@/lib/db/schema";
import type { LocationPrecision, NewsOrigin, NewsRelation, NewsStatus } from "@/lib/domain/constants";
import { boundingBox, distanceKm } from "@/lib/domain/location";
import { foldTurkish, similarity } from "@/lib/domain/text";
import type { BotAnalysis } from "@/lib/domain/types";

import { escapeLike } from "../news/public";

export const ADMIN_PAGE_SIZE = 25;

export interface AdminNewsListItem {
  id: string;
  slug: string;
  title: string;
  status: NewsStatus;
  origin: NewsOrigin;
  createdAt: string;
  occurredAt: string;
  publishedAt: string | null;
  locationLabel: string;
  precision: LocationPrecision;
  editorialScore: number | null;
  locationConfidence: number | null;
  isSensitive: boolean;
  citationCount: number;
  viewCount: number;
  commentCount: number;
  category: { key: string; nameTr: string; nameEn: string; color: string; icon: string };
  sourceName: string | null;
  submitterName: string | null;
  hasSuggestedParent: boolean;
}

export interface AdminNewsFilters {
  status?: NewsStatus;
  origin?: NewsOrigin;
  category?: string;
  q?: string;
  page: number;
  sort?: "newest" | "oldest";
}

export async function listAdminNews(filters: AdminNewsFilters): Promise<{ items: AdminNewsListItem[]; total: number }> {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(news.status, filters.status));
  if (filters.origin) conditions.push(eq(news.origin, filters.origin));
  if (filters.category) conditions.push(eq(categories.key, filters.category));
  if (filters.q) {
    for (const term of foldTurkish(filters.q).split(/\s+/).filter((word) => word.length > 1).slice(0, 5)) {
      conditions.push(ilike(news.searchText, `%${escapeLike(term)}%`));
    }
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const order = filters.sort === "oldest" ? asc(news.createdAt) : desc(news.createdAt);

  const [rows, [count]] = await Promise.all([
    db
      .select({
        id: news.id,
        slug: news.slug,
        title: news.title,
        status: news.status,
        origin: news.origin,
        createdAt: news.createdAt,
        occurredAt: news.occurredAt,
        publishedAt: news.publishedAt,
        locationLabel: news.locationLabel,
        precision: news.precision,
        editorialScore: news.editorialScore,
        locationConfidence: news.locationConfidence,
        isSensitive: news.isSensitive,
        citationCount: news.citationCount,
        viewCount: news.viewCount,
        commentCount: news.commentCount,
        categoryKey: categories.key,
        categoryNameTr: categories.nameTr,
        categoryNameEn: categories.nameEn,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
        sourceName: sources.name,
        submitterName: user.name,
        suggestedParentId: news.suggestedParentId,
      })
      .from(news)
      .innerJoin(categories, eq(news.categoryId, categories.id))
      .leftJoin(sources, eq(news.sourceId, sources.id))
      .leftJoin(user, eq(news.submittedById, user.id))
      .where(where)
      .orderBy(order)
      .limit(ADMIN_PAGE_SIZE)
      .offset((filters.page - 1) * ADMIN_PAGE_SIZE),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(news)
      .innerJoin(categories, eq(news.categoryId, categories.id))
      .where(where),
  ]);

  return {
    total: count?.count ?? 0,
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      origin: row.origin,
      createdAt: row.createdAt.toISOString(),
      occurredAt: row.occurredAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      locationLabel: row.locationLabel,
      precision: row.precision,
      editorialScore: row.editorialScore,
      locationConfidence: row.locationConfidence,
      isSensitive: row.isSensitive,
      citationCount: row.citationCount,
      viewCount: row.viewCount,
      commentCount: row.commentCount,
      category: { key: row.categoryKey, nameTr: row.categoryNameTr, nameEn: row.categoryNameEn, color: row.categoryColor, icon: row.categoryIcon },
      sourceName: row.sourceName,
      submitterName: row.submitterName,
      hasSuggestedParent: Boolean(row.suggestedParentId),
    })),
  };
}

export interface AdminNewsDetail {
  id: string;
  slug: string;
  status: NewsStatus;
  origin: NewsOrigin;
  title: string;
  summary: string | null;
  content: string | null;
  categoryKey: string;
  occurredAt: string;
  createdAt: string;
  publishedAt: string | null;
  reviewedAt: string | null;
  location: {
    latitude: number | null;
    longitude: number | null;
    precision: LocationPrecision;
    label: string;
    province: string | null;
    district: string | null;
    neighborhood: string | null;
    street: string | null;
    confidence: number | null;
    mention: string | null;
    notes: string | null;
  };
  publicPrecision: LocationPrecision;
  isSensitive: boolean;
  sensitivityType: string | null;
  isFeatured: boolean;
  imageUrl: string | null;
  sourceUrl: string | null;
  source: { id: string; name: string; kind: string; trust: string } | null;
  submittedBy: { id: string; name: string; email: string } | null;
  reviewedBy: { id: string; name: string } | null;
  reviewNote: string | null;
  rejectionReason: string | null;
  aiAnalysis: BotAnalysis | null;
  editorialScore: number | null;
  editorialConfidence: number | null;
  deaths: number | null;
  injured: number | null;
  citations: { id: string; url: string; title: string | null; publisherName: string | null; publishedAt: string | null }[];
  parent: { id: string; slug: string; title: string; relation: NewsRelation | null } | null;
  followUps: { id: string; slug: string; title: string; relation: NewsRelation | null; status: NewsStatus }[];
  suggestedParent: { id: string; slug: string; title: string; confidence: number | null; reason: string | null } | null;
  similar: { id: string; slug: string; title: string; status: NewsStatus; occurredAt: string; distanceKm: number | null; score: number }[];
}

export async function getAdminNews(id: string): Promise<AdminNewsDetail | null> {
  const row = await db.query.news.findFirst({
    where: eq(news.id, id),
    with: {
      category: { columns: { key: true } },
      source: { columns: { id: true, name: true, kind: true, trust: true } },
      submittedBy: { columns: { id: true, name: true, email: true } },
      reviewedBy: { columns: { id: true, name: true } },
      citations: { orderBy: asc(newsCitations.createdAt) },
      parent: { columns: { id: true, slug: true, title: true } },
      suggestedParent: { columns: { id: true, slug: true, title: true } },
      followUps: { columns: { id: true, slug: true, title: true, relation: true, status: true }, orderBy: asc(news.occurredAt) },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    origin: row.origin,
    title: row.title,
    summary: row.summary,
    content: row.content,
    categoryKey: row.category.key,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
      precision: row.precision,
      label: row.locationLabel,
      province: row.province,
      district: row.district,
      neighborhood: row.neighborhood,
      street: row.street,
      confidence: row.locationConfidence,
      mention: row.locationMention,
      notes: row.locationNotes,
    },
    publicPrecision: row.publicPrecision,
    isSensitive: row.isSensitive,
    sensitivityType: row.sensitivityType,
    isFeatured: row.isFeatured,
    imageUrl: row.imageUrl,
    sourceUrl: row.sourceUrl,
    source: row.source,
    submittedBy: row.submittedBy,
    reviewedBy: row.reviewedBy,
    reviewNote: row.reviewNote,
    rejectionReason: row.rejectionReason,
    aiAnalysis: row.aiAnalysis,
    editorialScore: row.editorialScore,
    editorialConfidence: row.editorialConfidence,
    deaths: row.deaths,
    injured: row.injured,
    citations: row.citations.map((citation) => ({
      id: citation.id,
      url: citation.url,
      title: citation.title,
      publisherName: citation.publisherName,
      publishedAt: citation.publishedAt?.toISOString() ?? null,
    })),
    parent: row.parent ? { ...row.parent, relation: row.relation } : null,
    followUps: row.followUps,
    suggestedParent: row.suggestedParent
      ? { ...row.suggestedParent, confidence: row.suggestedParentConfidence, reason: row.suggestedParentReason }
      : null,
    // Stories it is already attached to, or that hang off it, aren't offered again.
    similar: (
      await findSimilarNews({
        id: row.id,
        title: row.title,
        summary: row.summary,
        latitude: row.latitude,
        longitude: row.longitude,
        occurredAt: row.occurredAt,
        categoryId: row.categoryId,
      })
    ).filter((item) => item.id !== row.parentId && !row.followUps.some((followUp) => followUp.id === item.id)),
  };
}

/**
 * Stories an editor may want to merge with or attach to: same area and time window, scored by title overlap,
 * distance and category.
 */
export async function findSimilarNews(target: {
  id: string;
  title: string;
  summary: string | null;
  latitude: number | null;
  longitude: number | null;
  occurredAt: Date;
  categoryId: string;
}) {
  const windowStart = new Date(target.occurredAt.getTime() - 4 * 24 * 3600 * 1000);
  const windowEnd = new Date(target.occurredAt.getTime() + 2 * 24 * 3600 * 1000);
  const area =
    target.latitude != null && target.longitude != null ? boundingBox(target.latitude, target.longitude, 40) : null;

  const candidates = await db
    .select({
      id: news.id,
      slug: news.slug,
      title: news.title,
      summary: news.summary,
      status: news.status,
      occurredAt: news.occurredAt,
      latitude: news.latitude,
      longitude: news.longitude,
      categoryId: news.categoryId,
      parentId: news.parentId,
    })
    .from(news)
    .where(
      and(
        ne(news.id, target.id),
        or(eq(news.status, "published"), eq(news.status, "pending")),
        between(news.occurredAt, windowStart, windowEnd),
        area
          ? or(
              and(between(news.latitude, area.south, area.north), between(news.longitude, area.west, area.east)),
              eq(news.categoryId, target.categoryId),
            )
          : eq(news.categoryId, target.categoryId),
      ),
    )
    .orderBy(desc(news.occurredAt))
    .limit(80);

  const text = `${target.title} ${target.summary ?? ""}`;
  return candidates
    .map((candidate) => {
      const distance =
        target.latitude != null && target.longitude != null && candidate.latitude != null && candidate.longitude != null
          ? distanceKm(
              { latitude: target.latitude, longitude: target.longitude },
              { latitude: candidate.latitude, longitude: candidate.longitude },
            )
          : null;
      const textScore = similarity(text, `${candidate.title} ${candidate.summary ?? ""}`);
      const distanceScore = distance == null ? 0.3 : Math.max(0, 1 - distance / 25);
      const categoryScore = candidate.categoryId === target.categoryId ? 1 : 0;
      const score = textScore * 0.6 + distanceScore * 0.25 + categoryScore * 0.15;
      return {
        id: candidate.id,
        slug: candidate.slug,
        title: candidate.title,
        status: candidate.status,
        occurredAt: candidate.occurredAt.toISOString(),
        distanceKm: distance == null ? null : Math.round(distance * 10) / 10,
        score: Math.round(score * 100) / 100,
      };
    })
    .filter((candidate) => candidate.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** Stories to attach a follow-up to: published, recent, searchable by title. */
export async function searchParentCandidates(query: string, excludeId: string) {
  const terms = foldTurkish(query)
    .split(/\s+/)
    .filter((term) => term.length > 1)
    .slice(0, 5);
  return db
    .select({ id: news.id, slug: news.slug, title: news.title, occurredAt: news.occurredAt, locationLabel: news.locationLabel })
    .from(news)
    .where(
      and(
        eq(news.status, "published"),
        ne(news.id, excludeId),
        gte(news.occurredAt, new Date(Date.now() - 60 * 24 * 3600 * 1000)),
        ...terms.map((term) => ilike(news.searchText, `%${escapeLike(term)}%`)),
      ),
    )
    .orderBy(desc(news.occurredAt))
    .limit(10);
}
