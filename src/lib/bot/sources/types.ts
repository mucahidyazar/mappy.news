import type { NewsMedia } from "@/lib/domain/types";

/** A post or feed entry as collected, before any analysis. */
export interface CollectedEntry {
  externalId: string;
  url: string | null;
  title: string | null;
  body: string;
  author: string | null;
  publishedAt: Date | null;
  media: NewsMedia[];
}
