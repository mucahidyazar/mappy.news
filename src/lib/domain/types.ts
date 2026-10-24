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

/** People killed and injured as a report states them; null where it gives no number. */
export interface Casualties {
  deaths: number | null;
  injured: number | null;
}

export const MERGE_ACTIONS = ["duplicate", "update", "new"] as const;
export type MergeAction = (typeof MERGE_ACTIONS)[number];

/** The AI's verdict on how a new report relates to similar stories, kept with the report for editors. */
export interface MergeDecisionRecord {
  action: MergeAction;
  /** The story it duplicates or updates; null for a new incident. */
  targetId: string | null;
  confidence: number;
  reason: string;
  model: string;
  /** False when the AI wasn't sure enough and the decision was left to an editor as a suggestion. */
  applied: boolean;
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
    /** Only when the text gives it. */
    houseNumber?: string | null;
    /** The other street at an intersection. */
    crossStreet?: string | null;
    place: string | null;
    /** Highway or road of a traffic incident, and which part of it ("Avcılar mevkii", "45. km"). */
    road?: string | null;
    roadSection?: string | null;
    precision: LocationPrecision;
    confidence: number;
    evidence: string;
  };
  editorialScore: number;
  confidence: number;
  isSensitive: boolean;
  sensitivityType: string | null;
  keywords: string[];
  /** Absent in analyses made before casualties were extracted. */
  casualties?: Casualties | null;
  /** Set when the merge agent compared the report with similar stories. */
  merge?: MergeDecisionRecord | null;
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
  /** How the bot found the point: address, junction, place, street, road, neighborhood, district, city. */
  method?: string;
}

export interface ParentSuggestion {
  newsId: string;
  relation: NewsRelation | "duplicate";
  confidence: number;
  reason: string;
}
