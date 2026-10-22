import type { LocationPrecision } from "@/lib/domain/constants";
import { isInTurkey } from "@/lib/domain/location";

import { normalizeAddressPart } from "./address";
import { RequestQueue, requestSignal } from "./rate-limit";
import type { BoundingBox, GeocodeCandidate } from "./types";

interface PhotonProperties {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  locality?: string;
  city?: string;
  county?: string;
  state?: string;
  countrycode?: string;
  osm_key?: string;
  osm_value?: string;
  type?: string;
  /** [west, north, east, south] */
  extent?: [number, number, number, number];
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: PhotonProperties;
}

/** OSM keys of things that stand at one spot: buildings, shops, schools, stations, monuments. */
const POINT_KEYS = new Set([
  "amenity", "shop", "building", "tourism", "leisure", "office", "craft", "man_made", "historic", "railway",
  "aeroway", "healthcare", "public_transport", "emergency", "club", "sport", "bridge",
]);
const NEIGHBORHOOD_PLACES = new Set(["neighbourhood", "suburb", "quarter", "village", "hamlet", "isolated_dwelling", "locality"]);

export function photonPrecision(properties: PhotonProperties): LocationPrecision {
  const { osm_key: key = "", osm_value: value = "", type = "" } = properties;
  if (key === "highway") return value === "traffic_signals" || value === "bus_stop" || properties.housenumber ? "exact" : "street";
  if (properties.housenumber || type === "house" || POINT_KEYS.has(key)) return "exact";
  if (key === "place") {
    if (NEIGHBORHOOD_PLACES.has(value)) return "neighborhood";
    if (value === "town") return "district";
    if (value === "city") return "city";
  }
  switch (type) {
    case "street":
      return "street";
    case "locality":
    case "district":
      return "neighborhood";
    case "city":
    case "county":
      return "district";
    case "state":
      return "city";
    case "country":
      return "country";
  }
  // Industrial estates, parks and other areas: about a neighborhood.
  return "neighborhood";
}

export function parsePhotonFeature(feature: PhotonFeature): GeocodeCandidate | null {
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  if (latitude == null || longitude == null || !isInTurkey(latitude, longitude)) return null;
  const properties = feature.properties ?? {};
  if (properties.countrycode && properties.countrycode.toUpperCase() !== "TR") return null;
  const province = properties.state ?? null;
  const district = properties.county ?? (properties.city && properties.city !== province ? properties.city : null);
  // Photon carries OSM's own abbreviations ("Konak Mah.").
  const neighborhood = normalizeAddressPart(properties.district ?? properties.locality ?? null);
  const [west, north, east, south] = properties.extent ?? [];
  const street = properties.street ?? (properties.osm_key === "highway" ? (properties.name ?? null) : null);
  return {
    latitude,
    longitude,
    displayName: [properties.name, street && properties.name !== street ? street : null, neighborhood, district, province].filter(Boolean).join(", "),
    name: properties.name ?? null,
    precision: photonPrecision(properties),
    province,
    district: district && district !== province ? district : null,
    neighborhood,
    street,
    provider: "photon",
    importance: 0,
    placeRank: 0,
    bbox: west != null && north != null && east != null && south != null ? { west, north, east, south } : null,
    kind: properties.osm_key ? `${properties.osm_key}:${properties.osm_value ?? ""}` : null,
  };
}

export interface PhotonOptions {
  baseUrl: string;
  userAgent: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Photon (komoot): OSM search that tolerates spelling differences, good at named places such as shops, schools,
 * industrial estates and junctions. Searches can be restricted to a box and biased towards a point.
 */
export class PhotonClient {
  private readonly queue: RequestQueue;

  constructor(private readonly options: PhotonOptions) {
    this.queue = new RequestQueue(options.minIntervalMs ?? 600);
  }

  async search(
    query: string,
    options: { bbox?: BoundingBox | null; near?: { latitude: number; longitude: number } | null; limit?: number; signal?: AbortSignal } = {},
  ): Promise<GeocodeCandidate[]> {
    const url = new URL("api", this.options.baseUrl.endsWith("/") ? this.options.baseUrl : `${this.options.baseUrl}/`);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(options.limit ?? 6));
    if (options.bbox) url.searchParams.set("bbox", [options.bbox.west, options.bbox.south, options.bbox.east, options.bbox.north].map((n) => n.toFixed(5)).join(","));
    if (options.near) {
      url.searchParams.set("lat", options.near.latitude.toFixed(5));
      url.searchParams.set("lon", options.near.longitude.toFixed(5));
    }
    const body = (await this.queue.schedule(async () => {
      const response = await (this.options.fetchImpl ?? fetch)(url, {
        headers: { "User-Agent": this.options.userAgent, Accept: "application/json" },
        signal: requestSignal(options.signal, this.options.timeoutMs ?? 10_000),
      });
      if (response.status === 429) throw new Error("Photon rate limit reached");
      if (!response.ok) throw new Error(`Photon responded ${response.status}`);
      return response.json();
    })) as { features?: PhotonFeature[] };
    return (body.features ?? []).map(parsePhotonFeature).filter((item): item is GeocodeCandidate => item !== null);
  }
}
