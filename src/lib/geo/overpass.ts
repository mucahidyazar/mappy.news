import { distanceKm } from "@/lib/domain/location";

import { streetNamePattern } from "./address";
import { RequestQueue, requestSignal } from "./rate-limit";
import type { BoundingBox, GeocodeCandidate } from "./types";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

type Point = { latitude: number; longitude: number };

/** Overpass QL string literal. */
function quote(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function bboxFilter(box: BoundingBox) {
  return [box.south, box.west, box.north, box.east].map((value) => value.toFixed(5)).join(",");
}

function centroid(points: Point[]): Point {
  const latitude = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const longitude = points.reduce((sum, point) => sum + point.longitude, 0) / points.length;
  return { latitude, longitude };
}

/** Groups points that lie within `linkKm` of another point of the group (single linkage). */
export function clusterPoints<T extends Point>(points: T[], linkKm: number): T[][] {
  const clusters: T[][] = [];
  for (const point of points) {
    const touching = clusters.filter((cluster) => cluster.some((other) => distanceKm(point, other) <= linkKm));
    if (touching.length === 0) {
      clusters.push([point]);
      continue;
    }
    const merged = [point, ...touching.flat()];
    for (const cluster of touching) clusters.splice(clusters.indexOf(cluster), 1);
    clusters.push(merged);
  }
  return clusters;
}

function candidate(point: Point, precision: "exact" | "street", street: string | null, kind: string): GeocodeCandidate {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    displayName: street ?? "",
    precision,
    province: null,
    district: null,
    neighborhood: null,
    street,
    provider: "overpass",
    importance: 0,
    placeRank: 0,
    bbox: null,
    kind,
  };
}

export interface OverpassOptions {
  baseUrl: string;
  userAgent: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** OSM street geometry: where two streets meet, and where a named street runs inside a district. */
export class OverpassClient {
  private readonly queue: RequestQueue;

  constructor(private readonly options: OverpassOptions) {
    this.queue = new RequestQueue(options.minIntervalMs ?? 1_000);
  }

  private async run(query: string, signal?: AbortSignal): Promise<OverpassElement[]> {
    const body = (await this.queue.schedule(async () => {
      const response = await (this.options.fetchImpl ?? fetch)(this.options.baseUrl, {
        method: "POST",
        headers: { "User-Agent": this.options.userAgent, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: requestSignal(signal, this.options.timeoutMs ?? 25_000),
      });
      if (response.status === 429 || response.status === 504) throw new Error(`Overpass is busy (${response.status})`);
      if (!response.ok) throw new Error(`Overpass responded ${response.status}`);
      return response.json();
    })) as { elements?: OverpassElement[] };
    return body.elements ?? [];
  }

  /** The node shared by two named streets inside the box: an intersection, to the meter. */
  async junction(streetA: string, streetB: string, box: BoundingBox, options: { signal?: AbortSignal } = {}): Promise<GeocodeCandidate[]> {
    const a = streetNamePattern(streetA);
    const b = streetNamePattern(streetB);
    if (!a || !b) return [];
    const area = bboxFilter(box);
    const elements = await this.run(
      `[out:json][timeout:20];way["highway"]["name"~"${quote(a)}",i](${area})->.a;way["highway"]["name"~"${quote(b)}",i](${area})->.b;node(w.a)(w.b);out 20;`,
      options.signal,
    );
    const nodes = elements.filter((element) => element.lat != null && element.lon != null).map((element) => ({ latitude: element.lat!, longitude: element.lon! }));
    if (nodes.length === 0) return [];
    // Dual carriageways meet in several nodes a few meters apart; distant matches mean two different junctions.
    const clusters = clusterPoints(nodes, 0.15).sort((x, y) => y.length - x.length);
    return clusters.map((cluster) => candidate(centroid(cluster), "exact", `${streetA} / ${streetB}`, "overpass:junction"));
  }

  /**
   * Where a named street runs inside the box. One stretch gives its middle; several stretches far apart (the same
   * name in different neighborhoods) are returned separately, nearest to `near` first, for the caller to judge.
   */
  async street(name: string, box: BoundingBox, options: { near?: Point | null; signal?: AbortSignal } = {}): Promise<GeocodeCandidate[]> {
    // National roads are tagged by number: "D-100" is ref "D 100" / "D.100", whatever its name.
    const ref = /^([DO])[\s.-]?(\d{1,3})(?![\d])/i.exec(name.trim());
    const pattern = ref ? `(^|;) *${ref[1]!.toUpperCase()}[ .-]?${ref[2]}( *;|$)` : streetNamePattern(name);
    if (!pattern) return [];
    const filter = ref ? `["ref"~"${quote(pattern)}",i]` : `["name"~"${quote(pattern)}",i]`;
    const elements = await this.run(`[out:json][timeout:20];way["highway"]${filter}(${bboxFilter(box)});out center tags 60;`, options.signal);
    const ways = elements
      .filter((element) => element.center)
      .map((element) => ({ latitude: element.center!.lat, longitude: element.center!.lon, name: element.tags?.name ?? name }));
    if (ways.length === 0) return [];
    const clusters = clusterPoints(ways, 0.4).map((cluster) => ({ cluster, center: centroid(cluster) }));
    const near = options.near;
    clusters.sort((x, y) => (near ? distanceKm(x.center, near) - distanceKm(y.center, near) : y.cluster.length - x.cluster.length));
    return clusters.map(({ cluster, center }) => candidate(center, "street", cluster[0]!.name, "overpass:street"));
  }
}
