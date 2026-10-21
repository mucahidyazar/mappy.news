import type { LocationPrecision, NewsOrigin, NewsRelation, NewsStatus } from "@/lib/domain/constants";

export interface CategoryDTO {
  id: string;
  key: string;
  nameTr: string;
  nameEn: string;
  color: string;
  icon: string;
  isSensitive: boolean;
  sortOrder: number;
}

/** A published story as the public map needs it; coordinates are the privacy-adjusted public ones. */
export interface MapNewsItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  categoryKey: string;
  latitude: number;
  longitude: number;
  precision: LocationPrecision;
  locationLabel: string;
  occurredAt: string;
  publishedAt: string | null;
  sourceName: string | null;
  citationCount: number;
  commentCount: number;
  imageUrl: string | null;
  isSensitive: boolean;
  hasFollowUps: boolean;
}

export interface MapNewsResponse {
  items: MapNewsItem[];
  truncated: boolean;
}

export interface NewsCitationDTO {
  id: string;
  url: string;
  title: string | null;
  publisherName: string | null;
  publishedAt: string | null;
}

export interface NewsTimelineEntry {
  id: string;
  slug: string;
  title: string;
  relation: NewsRelation | null;
  occurredAt: string;
  isCurrent: boolean;
}

export interface NewsDetail {
  id: string;
  slug: string;
  status: NewsStatus;
  origin: NewsOrigin;
  title: string;
  summary: string | null;
  content: string | null;
  category: CategoryDTO;
  locationLabel: string;
  precision: LocationPrecision;
  latitude: number | null;
  longitude: number | null;
  occurredAt: string;
  publishedAt: string | null;
  updatedAt: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  source: { id: string; name: string; homepageUrl: string | null; trust: string } | null;
  submittedBy: { id: string; name: string; image: string | null } | null;
  /** Published by the news bot without an editor's review. */
  autoPublished: boolean;
  isSensitive: boolean;
  viewCount: number;
  commentCount: number;
  citations: NewsCitationDTO[];
  timeline: NewsTimelineEntry[];
  verificationOpen: boolean;
}
