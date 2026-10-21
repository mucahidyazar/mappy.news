import type { LocationPrecision } from "@/lib/domain/constants";
import { isInTurkey } from "@/lib/domain/location";

import { RequestQueue, requestSignal } from "./rate-limit";
import type { BoundingBox, GeocodeCandidate } from "./types";

export type { GeocodeCandidate } from "./types";

interface NominatimAddress {
  house_number?: string;
  road?: string;
  quarter?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  hamlet?: string;
  town?: string;
  county?: string;
  city_district?: string;
  municipality?: string;
  city?: string;
  province?: string;
  state?: string;
  region?: string;
  country_code?: string;
}

export interface NominatimPlace {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  category?: string;
  addresstype?: string;
  type?: string;
  place_rank?: number;
  importance?: number;
  /** [south, north, west, east] */
  boundingbox?: [string, string, string, string];
  /** With polygon_geojson=1: the way's geometry. */
  geojson?: { type: string; coordinates: unknown };
  address?: NominatimAddress;
}

const EXACT_TYPES = new Set(["building", "house", "amenity", "shop", "office", "tourism", "leisure", "railway", "aeroway", "place"]);

export function precisionFromPlace(place: NominatimPlace): LocationPrecision {
  const type = place.addresstype ?? place.type ?? "";
  if (place.address?.house_number || (EXACT_TYPES.has(type) && (place.place_rank ?? 0) >= 28)) return "exact";
  switch (type) {
    case "road":
    case "street":
      return "street";
    case "quarter":
    case "suburb":
    case "neighbourhood":
    case "village":
    case "hamlet":
    case "isolated_dwelling":
      return "neighborhood";
    // In Türkiye's data a mahalle boundary is a "city_district" and an ilçe a "town" (or a "city" boundary,
    // such as "Zonguldak Merkez").
    case "city_district":
      return "neighborhood";
    case "town":
    case "county":
    case "municipality":
    case "district":
      return "district";
    case "city":
      return place.category === "boundary" ? "district" : "city";
    case "province":
      return "city";
    case "state":
    case "region":
      return "region";
    case "country":
      return "country";
  }
  const rank = place.place_rank ?? 0;
  if (rank >= 28) return "exact";
  if (rank >= 26) return "street";
  if (rank >= 17) return "neighborhood";
  if (rank >= 13) return "district";
  if (rank >= 10) return "city";
  if (rank >= 5) return "region";
  return "country";
}

/** Maps a Nominatim result to Turkish administrative parts: il, ilçe, mahalle, sokak. */
export function parsePlace(place: NominatimPlace): GeocodeCandidate | null {
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  if (!isInTurkey(latitude, longitude)) return null;
  const address = place.address ?? {};
  if (address.country_code && address.country_code !== "tr") return null;
  const province = address.province ?? address.state ?? address.city ?? null;
  const cityAsDistrict = address.city && address.city !== province ? address.city : null;
  const district = address.town ?? address.county ?? address.municipality ?? cityAsDistrict ?? null;
  const neighborhood = address.city_district ?? address.suburb ?? address.quarter ?? address.neighbourhood ?? address.village ?? address.hamlet ?? null;
  return {
    latitude,
    longitude,
    displayName: place.display_name ?? [neighborhood, district, province].filter(Boolean).join(", "),
    name: place.name || null,
    precision: precisionFromPlace(place),
    province,
    district: district === province ? null : district,
    neighborhood,
    street: address.road ?? null,
    provider: "nominatim",
    importance: place.importance ?? 0,
    placeRank: place.place_rank ?? 0,
    bbox: parseBoundingBox(place.boundingbox),
    kind: place.category ? `${place.category}:${place.type ?? ""}` : null,
    lines: parseLines(place.geojson),
  };
}

function parseLines(geojson: NominatimPlace["geojson"]): Array<Array<[number, number]>> | null {
  if (!geojson) return null;
  if (geojson.type === "LineString") return [geojson.coordinates as Array<[number, number]>];
  if (geojson.type === "MultiLineString") return geojson.coordinates as Array<Array<[number, number]>>;
  return null;
}

function parseBoundingBox(box: NominatimPlace["boundingbox"]): BoundingBox | null {
  if (!box) return null;
  const [south, north, west, east] = box.map(Number);
  return [south, north, west, east].every((value) => Number.isFinite(value)) ? { south: south!, north: north!, west: west!, east: east! } : null;
}

export interface NominatimOptions {
  baseUrl: string;
  userAgent: string;
  email?: string;
  /** The public instance allows one request per second. */
  minIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Nominatim client that keeps the usage policy's spacing between requests. */
export class NominatimClient {
  private readonly queue: RequestQueue;

  constructor(private readonly options: NominatimOptions) {
    this.queue = new RequestQueue(options.minIntervalMs ?? 1_100);
  }

  private async request(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
    const url = new URL(path, this.options.baseUrl.endsWith("/") ? this.options.baseUrl : `${this.options.baseUrl}/`);
    for (const [key, value] of Object.entries({ format: "jsonv2", addressdetails: "1", "accept-language": "tr", ...params })) {
      url.searchParams.set(key, value);
    }
    if (this.options.email) url.searchParams.set("email", this.options.email);
    return this.queue.schedule(async () => {
      const response = await (this.options.fetchImpl ?? fetch)(url, {
        headers: { "User-Agent": this.options.userAgent, Accept: "application/json" },
        signal: requestSignal(signal, this.options.timeoutMs ?? 10_000),
      });
      if (response.status === 429) throw new Error("Geocoder rate limit reached");
      if (!response.ok) throw new Error(`Geocoder responded ${response.status}`);
      return response.json();
    });
  }

  private parseList(body: unknown) {
    if (!Array.isArray(body)) return [];
    return body.map((place) => parsePlace(place as NominatimPlace)).filter((item): item is GeocodeCandidate => item !== null);
  }

  /**
   * Free-form search; with `bbox` only results inside the box come back. `geometry` returns every matching street
   * segment (no de-duplication) with its line, for finding where streets meet.
   */
  async search(
    query: string,
    options: { limit?: number; bbox?: BoundingBox | null; geometry?: boolean; signal?: AbortSignal } = {},
  ): Promise<GeocodeCandidate[]> {
    const params: Record<string, string> = { q: query, countrycodes: "tr", limit: String(options.limit ?? 5), dedupe: options.geometry ? "0" : "1" };
    if (options.geometry) {
      params.polygon_geojson = "1";
      params.polygon_threshold = "0.00001";
    }
    if (options.bbox) {
      params.viewbox = [options.bbox.west, options.bbox.north, options.bbox.east, options.bbox.south].map((n) => n.toFixed(5)).join(",");
      params.bounded = "1";
    }
    return this.parseList(await this.request("search", params, options.signal));
  }

  /** Structured address search ("12 Demir Sokak" in Kağıthane, İstanbul): the way to reach a house number. */
  async address(
    parts: { street: string; city?: string | null; state?: string | null },
    options: { limit?: number; signal?: AbortSignal } = {},
  ): Promise<GeocodeCandidate[]> {
    const params: Record<string, string> = { street: parts.street, countrycodes: "tr", limit: String(options.limit ?? 5) };
    if (parts.city) params.city = parts.city;
    if (parts.state) params.state = parts.state;
    return this.parseList(await this.request("search", params, options.signal));
  }

  async reverse(latitude: number, longitude: number, options: { zoom?: number; signal?: AbortSignal } = {}) {
    const body = (await this.request(
      "reverse",
      { lat: latitude.toFixed(6), lon: longitude.toFixed(6), zoom: String(options.zoom ?? 18) },
      options.signal,
    )) as NominatimPlace & { error?: string };
    if (!body || body.error) return null;
    return parsePlace(body);
  }
}
