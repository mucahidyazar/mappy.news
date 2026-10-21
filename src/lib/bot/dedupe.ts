import { and, between, eq, inArray, or } from "drizzle-orm";

import { categories, news, newsCitations } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/types";
import { boundingBox, distanceKm } from "@/lib/domain/location";
import { foldTurkish, similarity } from "@/lib/domain/text";

export interface DedupeSubject {
  title: string;
  summary: string;
  url: string | null;
  categoryKey: string;
  occurredAt: Date;
  latitude: number | null;
  longitude: number | null;
  province: string | null;
  district: string | null;
}

export interface DedupeCandidate {
  id: string;
  parentId: string | null;
  title: string;
  summary: string | null;
  categoryKey: string;
  occurredAt: Date;
  latitude: number | null;
  longitude: number | null;
  province: string | null;
  district: string | null;
  urls: string[];
}

export interface DedupeDecision {
  kind: "new" | "duplicate" | "follow_up";
  target: DedupeCandidate | null;
  score: number;
  reason: string;
}

function samePlace(a: string | null, b: string | null) {
  return Boolean(a && b && foldTurkish(a) === foldTurkish(b));
}

/** How likely two reports describe the same incident, in [0, 1]. */
export function scoreCandidate(subject: DedupeSubject, candidate: DedupeCandidate): { score: number; text: number } {
  const text = similarity(`${subject.title} ${subject.summary}`, `${candidate.title} ${candidate.summary ?? ""}`);

  let place = 0;
  if (subject.latitude != null && subject.longitude != null && candidate.latitude != null && candidate.longitude != null) {
    const km = distanceKm({ latitude: subject.latitude, longitude: subject.longitude }, { latitude: candidate.latitude, longitude: candidate.longitude });
    place = km <= 1 ? 1 : km <= 5 ? 0.8 : km <= 15 ? 0.5 : km <= 40 ? 0.2 : 0;
  }
  if (samePlace(subject.district, candidate.district)) place = Math.max(place, 0.7);
  else if (samePlace(subject.province, candidate.province)) place = Math.max(place, 0.3);

  const hours = Math.abs(subject.occurredAt.getTime() - candidate.occurredAt.getTime()) / 3_600_000;
  const time = hours <= 6 ? 1 : hours <= 24 ? 0.8 : hours <= 48 ? 0.5 : hours <= 96 ? 0.2 : 0;
  const category = subject.categoryKey === candidate.categoryKey ? 1 : 0;

  const score = text * 0.55 + place * 0.2 + time * 0.15 + category * 0.1;
  return { score: Math.round(score * 100) / 100, text };
}

/**
 * duplicate: the same incident again (its source becomes a citation of the existing story).
 * follow_up: probably new information about an earlier incident (stored with a suggested parent).
 */
export function decideDedupe(subject: DedupeSubject, candidates: DedupeCandidate[]): DedupeDecision {
  if (subject.url) {
    const sameUrl = candidates.find((candidate) => candidate.urls.includes(subject.url!));
    if (sameUrl) return { kind: "duplicate", target: sameUrl, score: 1, reason: "same_url" };
  }
  let best: { candidate: DedupeCandidate; score: number; text: number } | null = null;
  for (const candidate of candidates) {
    const result = scoreCandidate(subject, candidate);
    if (!best || result.score > best.score) best = { candidate, ...result };
  }
  if (!best) return { kind: "new", target: null, score: 0, reason: "no_candidates" };
  if (best.score >= 0.6 && best.text >= 0.35 && best.candidate.categoryKey === subject.categoryKey) {
    return { kind: "duplicate", target: best.candidate, score: best.score, reason: "same_incident" };
  }
  if (best.score >= 0.45 && best.text >= 0.25) {
    return { kind: "follow_up", target: best.candidate, score: best.score, reason: "related_incident" };
  }
  return { kind: "new", target: null, score: best.score, reason: "below_threshold" };
}

/** Published or pending stories from the surrounding days, in the same area or category. */
export async function loadDedupeCandidates(db: DbExecutor, subject: DedupeSubject): Promise<DedupeCandidate[]> {
  const from = new Date(subject.occurredAt.getTime() - 4 * 24 * 3600 * 1000);
  const to = new Date(subject.occurredAt.getTime() + 2 * 24 * 3600 * 1000);
  const box = subject.latitude != null && subject.longitude != null ? boundingBox(subject.latitude, subject.longitude, 40) : null;
  const rows = await db
    .select({
      id: news.id,
      parentId: news.parentId,
      title: news.title,
      summary: news.summary,
      categoryKey: categories.key,
      occurredAt: news.occurredAt,
      latitude: news.latitude,
      longitude: news.longitude,
      province: news.province,
      district: news.district,
      sourceUrl: news.sourceUrl,
    })
    .from(news)
    .innerJoin(categories, eq(news.categoryId, categories.id))
    .where(
      and(
        inArray(news.status, ["published", "pending"]),
        between(news.occurredAt, from, to),
        box
          ? or(
              and(between(news.latitude, box.south, box.north), between(news.longitude, box.west, box.east)),
              eq(categories.key, subject.categoryKey),
            )
          : eq(categories.key, subject.categoryKey),
      ),
    )
    .limit(150);
  if (rows.length === 0) return [];

  const citations = await db
    .select({ newsId: newsCitations.newsId, url: newsCitations.url })
    .from(newsCitations)
    .where(inArray(newsCitations.newsId, rows.map((row) => row.id)));
  const urls = new Map<string, string[]>();
  for (const citation of citations) urls.set(citation.newsId, [...(urls.get(citation.newsId) ?? []), citation.url]);

  return rows.map((row) => ({
    id: row.id,
    parentId: row.parentId,
    title: row.title,
    summary: row.summary,
    categoryKey: row.categoryKey,
    occurredAt: row.occurredAt,
    latitude: row.latitude,
    longitude: row.longitude,
    province: row.province,
    district: row.district,
    urls: [...(urls.get(row.id) ?? []), ...(row.sourceUrl ? [row.sourceUrl] : [])],
  }));
}
