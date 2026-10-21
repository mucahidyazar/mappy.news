import type { LocationPrecision } from "@/lib/domain/constants";
import { isInTurkey } from "@/lib/domain/location";
import type { GeocodeResult } from "@/lib/domain/types";

export interface GeocodeCandidate extends GeocodeResult {
  street: string | null;
  importance: number;
  placeRank: number;
}

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
  display_name?: string;
  addresstype?: string;
  type?: string;
  place_rank?: number;
  importance?: number;
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
    case "town":
    case "county":
    case "city_district":
    case "municipality":
    case "district":
      return "district";
    case "city":
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
  const district = address.town ?? address.county ?? address.city_district ?? address.municipality ?? cityAsDistrict ?? null;
  const neighborhood = address.suburb ?? address.quarter ?? address.neighbourhood ?? address.village ?? address.hamlet ?? null;
  return {
    latitude,
    longitude,
    displayName: place.display_name ?? [neighborhood, district, province].filter(Boolean).join(", "),
    precision: precisionFromPlace(place),
    province,
    district: district === province ? null : district,
    neighborhood,
    street: address.road ?? null,
    provider: "nominatim",
    importance: place.importance ?? 0,
    placeRank: place.place_rank ?? 0,
  };
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

/** Sequential Nominatim client that keeps the usage policy's spacing between requests. */
export class NominatimClient {
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(private readonly options: NominatimOptions) {}

  private schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = (this.options.minIntervalMs ?? 1_100) - (Date.now() - this.lastRequestAt);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      try {
        return await task();
      } finally {
        this.lastRequestAt = Date.now();
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async request(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
    const url = new URL(path, this.options.baseUrl.endsWith("/") ? this.options.baseUrl : `${this.options.baseUrl}/`);
    for (const [key, value] of Object.entries({ format: "jsonv2", addressdetails: "1", "accept-language": "tr", ...params })) {
      url.searchParams.set(key, value);
    }
    if (this.options.email) url.searchParams.set("email", this.options.email);
    return this.schedule(async () => {
      const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 10_000);
      const response = await (this.options.fetchImpl ?? fetch)(url, {
        headers: { "User-Agent": this.options.userAgent, Accept: "application/json" },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (response.status === 429) throw new Error("Geocoder rate limit reached");
      if (!response.ok) throw new Error(`Geocoder responded ${response.status}`);
      return response.json();
    });
  }

  async search(query: string, options: { limit?: number; signal?: AbortSignal } = {}): Promise<GeocodeCandidate[]> {
    const body = await this.request(
      "search",
      { q: query, countrycodes: "tr", limit: String(options.limit ?? 5), dedupe: "1" },
      options.signal,
    );
    if (!Array.isArray(body)) return [];
    return body.map((place) => parsePlace(place as NominatimPlace)).filter((item): item is GeocodeCandidate => item !== null);
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
