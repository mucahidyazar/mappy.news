import { createHash } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { geocodeCache } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/types";
import { foldTurkish, normalizeWhitespace } from "@/lib/domain/text";

import { NominatimClient } from "./nominatim";
import { OverpassClient } from "./overpass";
import { PhotonClient } from "./photon";
import type { BoundingBox, GeocodeCandidate } from "./types";

const HIT_TTL_DAYS = 30;
const MISS_TTL_DAYS = 3;

type Near = { latitude: number; longitude: number } | null;

export interface Geocoder {
  /** Free-form search (Nominatim); restricted to `bbox` when given. */
  search(query: string, options?: { limit?: number; bbox?: BoundingBox | null; signal?: AbortSignal }): Promise<GeocodeCandidate[]>;
  /** A street address with a house number (Nominatim structured search). */
  address?(parts: { street: string; city?: string | null; state?: string | null }, options?: { signal?: AbortSignal }): Promise<GeocodeCandidate[]>;
  /** A named place: business, school, industrial estate, junction (Photon). */
  place?(query: string, options?: { bbox?: BoundingBox | null; near?: Near; signal?: AbortSignal }): Promise<GeocodeCandidate[]>;
  /** Where two streets meet (Overpass). */
  junction?(streetA: string, streetB: string, bbox: BoundingBox, options?: { signal?: AbortSignal }): Promise<GeocodeCandidate[]>;
  /** Where a named street or road runs inside a box (Overpass). */
  streetLine?(name: string, bbox: BoundingBox, options?: { near?: Near; signal?: AbortSignal }): Promise<GeocodeCandidate[]>;
  /** Every segment of a named street inside a box, with its geometry (Nominatim). */
  lines?(name: string, bbox: BoundingBox, options?: { signal?: AbortSignal }): Promise<GeocodeCandidate[]>;
  reverse(latitude: number, longitude: number, options?: { signal?: AbortSignal }): Promise<GeocodeCandidate | null>;
}

export interface GeocodeCache {
  get(key: string): Promise<GeocodeCandidate[] | null>;
  set(key: string, entry: { query: string; provider: string; result: GeocodeCandidate[] }): Promise<void>;
}

/** The geocode_cache table: each distinct question reaches a public service about once a month. */
export function databaseCache(db: DbExecutor): GeocodeCache {
  return {
    async get(key) {
      const [hit] = await db
        .select({ result: geocodeCache.result })
        .from(geocodeCache)
        .where(and(eq(geocodeCache.queryKey, key), gt(geocodeCache.expiresAt, new Date())))
        .limit(1);
      return hit ? (hit.result as GeocodeCandidate[]) : null;
    },
    async set(key, { query, provider, result }) {
      const first = result[0];
      const ttlDays = result.length ? HIT_TTL_DAYS : MISS_TTL_DAYS;
      const values = {
        queryKey: key,
        query: query.slice(0, 500),
        provider,
        latitude: first?.latitude ?? null,
        longitude: first?.longitude ?? null,
        displayName: first?.displayName ?? null,
        precision: first?.precision ?? null,
        result,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 3600 * 1000),
      };
      await db.insert(geocodeCache).values(values).onConflictDoUpdate({ target: geocodeCache.queryKey, set: values });
    },
  };
}

/** For scripts and tests. */
export function memoryCache(): GeocodeCache {
  const entries = new Map<string, GeocodeCandidate[]>();
  return {
    async get(key) {
      return entries.get(key) ?? null;
    },
    async set(key, { result }) {
      entries.set(key, result);
    },
  };
}

function cacheKey(kind: string, value: string) {
  return `${kind}:${createHash("sha256").update(value).digest("hex").slice(0, 40)}`;
}

function boxKey(box: BoundingBox | null | undefined) {
  return box ? [box.west, box.south, box.east, box.north].map((value) => value.toFixed(3)).join(",") : "";
}

function nearKey(near: Near | undefined) {
  return near ? `${near.latitude.toFixed(2)},${near.longitude.toFixed(2)}` : "";
}

export interface GeocoderClients {
  nominatim: NominatimClient;
  photon?: PhotonClient | null;
  overpass?: OverpassClient | null;
}

/** All geocoding services behind one cache. Photon and Overpass are optional; without them those steps are skipped. */
export function createGeocoder(cache: GeocodeCache, clients: GeocoderClients): Geocoder {

  async function cached(kind: string, provider: string, query: string, load: () => Promise<GeocodeCandidate[]>) {
    const key = cacheKey(kind, foldTurkish(query));
    const hit = await cache.get(key);
    if (hit) return hit;
    const result = await load();
    await cache.set(key, { query, provider, result });
    return result;
  }

  const clean = (value: string) => normalizeWhitespace(value).slice(0, 200);
  const { nominatim, photon, overpass } = clients;

  return {
    async search(query, options = {}) {
      const text = clean(query);
      if (text.length < 2) return [];
      const limit = options.limit ?? 5;
      return cached(`search${limit}`, "nominatim", `${text}|${boxKey(options.bbox)}`, () => nominatim.search(text, { limit, bbox: options.bbox, signal: options.signal }));
    },
    async address(parts, options = {}) {
      const street = clean(parts.street);
      if (street.length < 3) return [];
      return cached("address", "nominatim", `${street}|${parts.city ?? ""}|${parts.state ?? ""}`, () =>
        nominatim.address({ street, city: parts.city, state: parts.state }, { signal: options.signal }),
      );
    },
    place: photon
      ? async (query, options = {}) => {
          const text = clean(query);
          if (text.length < 3) return [];
          return cached("place", "photon", `${text}|${boxKey(options.bbox)}|${nearKey(options.near)}`, () =>
            photon.search(text, { bbox: options.bbox, near: options.near, signal: options.signal }),
          );
        }
      : undefined,
    junction: overpass
      ? async (streetA, streetB, bbox, options = {}) =>
          cached("junction", "overpass", `${clean(streetA)}|${clean(streetB)}|${boxKey(bbox)}`, () => overpass.junction(streetA, streetB, bbox, options))
      : undefined,
    streetLine: overpass
      ? async (name, bbox, options = {}) =>
          cached("street", "overpass", `${clean(name)}|${boxKey(bbox)}|${nearKey(options.near)}`, () => overpass.street(name, bbox, options))
      : undefined,
    async lines(name, bbox, options = {}) {
      const text = clean(name);
      if (text.length < 2) return [];
      return cached("lines", "nominatim", `${text}|${boxKey(bbox)}`, () => nominatim.search(text, { bbox, geometry: true, limit: 40, signal: options.signal }));
    },
    async reverse(latitude, longitude, options = {}) {
      // ~11 m grid: nearby clicks share one answer.
      const rounded = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
      const result = await cached("reverse", "nominatim", rounded, async () => {
        const place = await nominatim.reverse(latitude, longitude, { signal: options.signal });
        return place ? [place] : [];
      });
      return result[0] ?? null;
    },
  };
}

export interface GeocoderEnv {
  NOMINATIM_URL: string;
  PHOTON_URL?: string;
  OVERPASS_URL?: string;
  GEOCODER_CONTACT_EMAIL?: string;
  APP_URL: string;
}

/**
 * The three OSM services. Public instances allow about one request per second; self-hosted ones (set the URLs)
 * can take `fast: true`.
 */
export function createGeocoderClients(env: GeocoderEnv, options: { fast?: boolean } = {}): GeocoderClients {
  const userAgent = `mappy.news/1.0 (+${env.APP_URL})`;
  const fast = options.fast ?? false;
  return {
    nominatim: new NominatimClient({ baseUrl: env.NOMINATIM_URL, userAgent, email: env.GEOCODER_CONTACT_EMAIL, minIntervalMs: fast ? 0 : 1_100 }),
    photon: env.PHOTON_URL ? new PhotonClient({ baseUrl: env.PHOTON_URL, userAgent, minIntervalMs: fast ? 0 : 600 }) : null,
    overpass: env.OVERPASS_URL ? new OverpassClient({ baseUrl: env.OVERPASS_URL, userAgent, minIntervalMs: fast ? 0 : 1_000 }) : null,
  };
}
