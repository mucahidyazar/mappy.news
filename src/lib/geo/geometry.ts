/** Polyline helpers for street geometry: [longitude, latitude] pairs, as in GeoJSON. */
export type LngLat = [number, number];
export type Line = LngLat[];

const EARTH_RADIUS_M = 6_371_008;

/** Meters on a local flat projection around `origin`; accurate to a few cm over a district. */
function project(point: LngLat, origin: LngLat): [number, number] {
  const scale = Math.cos((origin[1] * Math.PI) / 180);
  return [((point[0] - origin[0]) * Math.PI * EARTH_RADIUS_M * scale) / 180, ((point[1] - origin[1]) * Math.PI * EARTH_RADIUS_M) / 180];
}

function unproject(point: [number, number], origin: LngLat): LngLat {
  const scale = Math.cos((origin[1] * Math.PI) / 180);
  return [origin[0] + (point[0] * 180) / (Math.PI * EARTH_RADIUS_M * scale), origin[1] + (point[1] * 180) / (Math.PI * EARTH_RADIUS_M)];
}

type Vec = [number, number];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const lerp = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const length = (a: Vec) => Math.hypot(a[0], a[1]);

/** The point of segment ab closest to p. */
function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const ab = sub(b, a);
  const span = dot(ab, ab);
  if (span === 0) return a;
  return lerp(a, b, Math.min(1, Math.max(0, dot(sub(p, a), ab) / span)));
}

/** Closest points of two segments (exact for crossing segments, otherwise via the four endpoint projections). */
function closestBetweenSegments(a1: Vec, a2: Vec, b1: Vec, b2: Vec): { a: Vec; b: Vec; distance: number } {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const denominator = r[0] * s[1] - r[1] * s[0];
  if (denominator !== 0) {
    const q = sub(b1, a1);
    const t = (q[0] * s[1] - q[1] * s[0]) / denominator;
    const u = (q[0] * r[1] - q[1] * r[0]) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const point = lerp(a1, a2, t);
      return { a: point, b: point, distance: 0 };
    }
  }
  const options = [
    { a: a1, b: closestOnSegment(a1, b1, b2) },
    { a: a2, b: closestOnSegment(a2, b1, b2) },
    { a: closestOnSegment(b1, a1, a2), b: b1 },
    { a: closestOnSegment(b2, a1, a2), b: b2 },
  ];
  let best = { ...options[0]!, distance: length(sub(options[0]!.a, options[0]!.b)) };
  for (const option of options.slice(1)) {
    const distance = length(sub(option.a, option.b));
    if (distance < best.distance) best = { ...option, distance };
  }
  return best;
}

export interface Meeting {
  longitude: number;
  latitude: number;
  /** Gap between the two streets at that point; 0 where they cross or share a node. */
  distanceM: number;
}

/**
 * Where two streets meet: every place their geometries come within `maxGapM` of each other, closest first,
 * merged when they are less than `mergeM` apart (dual carriageways, roundabouts).
 */
export function meetingPoints(first: Line[], second: Line[], options: { maxGapM?: number; mergeM?: number } = {}): Meeting[] {
  const maxGap = options.maxGapM ?? 60;
  const merge = options.mergeM ?? 120;
  const origin = first[0]?.[0] ?? second[0]?.[0];
  if (!origin) return [];
  const a = first.map((line) => line.map((point) => project(point, origin)));
  const b = second.map((line) => line.map((point) => project(point, origin)));
  const found: Array<{ point: Vec; distance: number }> = [];
  for (const lineA of a) {
    for (let i = 0; i < lineA.length - 1; i += 1) {
      for (const lineB of b) {
        for (let j = 0; j < lineB.length - 1; j += 1) {
          const closest = closestBetweenSegments(lineA[i]!, lineA[i + 1]!, lineB[j]!, lineB[j + 1]!);
          if (closest.distance <= maxGap) found.push({ point: lerp(closest.a, closest.b, 0.5), distance: closest.distance });
        }
      }
    }
  }
  found.sort((x, y) => x.distance - y.distance);
  const groups: Array<{ point: Vec; distance: number }> = [];
  for (const entry of found) {
    if (groups.some((group) => length(sub(group.point, entry.point)) <= merge)) continue;
    groups.push(entry);
  }
  return groups.map(({ point, distance }) => {
    const [longitude, latitude] = unproject(point, origin);
    return { longitude, latitude, distanceM: Math.round(distance * 10) / 10 };
  });
}

/** The bounding box of some lines, grown by `marginKm`. */
export function linesBox(lines: Line[], marginKm = 0): { west: number; south: number; east: number; north: number } | null {
  const points = lines.flat();
  if (points.length === 0) return null;
  const longitudes = points.map((point) => point[0]);
  const latitudes = points.map((point) => point[1]);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const dLat = marginKm / 111.32;
  const dLng = marginKm / (111.32 * Math.max(Math.cos((((south + north) / 2) * Math.PI) / 180), 0.01));
  return { west: Math.min(...longitudes) - dLng, south: south - dLat, east: Math.max(...longitudes) + dLng, north: north + dLat };
}
