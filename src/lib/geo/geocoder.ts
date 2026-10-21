import { createHash } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { geocodeCache } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/types";
import { foldTurkish, normalizeWhitespace } from "@/lib/domain/text";

import { type GeocodeCandidate, NominatimClient } from "./nominatim";

const HIT_TTL_DAYS = 30;
const MISS_TTL_DAYS = 3;

export interface Geocoder {
  search(query: string, options?: { limit?: number; signal?: AbortSignal }): Promise<GeocodeCandidate[]>;
  reverse(latitude: number, longitude: number, options?: { signal?: AbortSignal }): Promise<GeocodeCandidate | null>;
}

function cacheKey(kind: string, value: string) {
  return `${kind}:${createHash("sha256").update(value).digest("hex").slice(0, 40)}`;
}

/** Nominatim behind the geocode_cache table: each distinct query reaches the public service once a month. */
export function createGeocoder(db: DbExecutor, client: NominatimClient): Geocoder {
  async function cached(
    key: string,
    query: string,
    load: () => Promise<GeocodeCandidate[]>,
  ): Promise<GeocodeCandidate[]> {
    const [hit] = await db
      .select({ result: geocodeCache.result })
      .from(geocodeCache)
      .where(and(eq(geocodeCache.queryKey, key), gt(geocodeCache.expiresAt, new Date())))
      .limit(1);
    if (hit) return hit.result as GeocodeCandidate[];

    const result = await load();
    const first = result[0];
    const ttlDays = result.length ? HIT_TTL_DAYS : MISS_TTL_DAYS;
    const values = {
      queryKey: key,
      query,
      provider: "nominatim",
      latitude: first?.latitude ?? null,
      longitude: first?.longitude ?? null,
      displayName: first?.displayName ?? null,
      precision: first?.precision ?? null,
      result,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + ttlDays * 24 * 3600 * 1000),
    };
    await db
      .insert(geocodeCache)
      .values(values)
      .onConflictDoUpdate({ target: geocodeCache.queryKey, set: values });
    return result;
  }

  return {
    async search(query, options = {}) {
      const normalized = normalizeWhitespace(query).slice(0, 200);
      if (normalized.length < 2) return [];
      const limit = options.limit ?? 5;
      return cached(cacheKey(`search${limit}`, foldTurkish(normalized)), normalized, () =>
        client.search(normalized, { limit, signal: options.signal }),
      );
    },
    async reverse(latitude, longitude, options = {}) {
      // ~11 m grid: nearby clicks share one answer.
      const rounded = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
      const result = await cached(cacheKey("reverse", rounded), rounded, async () => {
        const place = await client.reverse(latitude, longitude, { signal: options.signal });
        return place ? [place] : [];
      });
      return result[0] ?? null;
    },
  };
}

export function createNominatimClient(env: { NOMINATIM_URL: string; GEOCODER_CONTACT_EMAIL?: string; APP_URL: string }, minIntervalMs?: number) {
  return new NominatimClient({
    baseUrl: env.NOMINATIM_URL,
    userAgent: `mappy.news/1.0 (+${env.APP_URL})`,
    email: env.GEOCODER_CONTACT_EMAIL,
    minIntervalMs,
  });
}
