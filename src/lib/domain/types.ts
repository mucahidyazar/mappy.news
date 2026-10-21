import type { LocationPrecision, NewsRelation } from "./constants";

export interface NewsMedia {
  type: "image" | "video" | "x_post" | "youtube" | "link";
  url: string;
  previewUrl?: string;
}

/** Per-source polling state. RSS uses conditional requests, X uses since_id. */
export interface SourceCursor {
  sinceId?: string;
  etag?: string;
  lastModified?: string;
  lastItemAt?: string;
}

/** What the news bot concluded about a collected post; stored on the item and on the story it produced. */
export interface BotAnalysis {
  isIncident: boolean;
  rejectionReason: string | null;
  categoryKey: string;
  title: string;
  summary: string;
  content: string;
  occurredAt: string | null;
  location: {
    mention: string;
    province: string | null;
    district: string | null;
    neighborhood: string | null;
    street: string | null;
    place: string | null;
    precision: LocationPrecision;
    confidence: number;
    evidence: string;
  };
  editorialScore: number;
  confidence: number;
  isSensitive: boolean;
  sensitivityType: string | null;
  keywords: string[];
  model: string;
  promptVersion: string;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
  precision: LocationPrecision;
  province: string | null;
  district: string | null;
  neighborhood: string | null;
  provider: string;
}

export interface ParentSuggestion {
  newsId: string;
  relation: NewsRelation | "duplicate";
  confidence: number;
  reason: string;
}
