import { LOCATION_PRECISIONS, type LocationPrecision } from "./constants";

/** Mainland Turkey plus islands, with a small margin. */
export const TURKEY_BOUNDS = { minLat: 35.7, maxLat: 42.2, minLng: 25.5, maxLng: 44.9 } as const;
export const TURKEY_CENTER = { latitude: 39.0, longitude: 35.2 } as const;

export function isInTurkey(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= TURKEY_BOUNDS.minLat &&
    latitude <= TURKEY_BOUNDS.maxLat &&
    longitude >= TURKEY_BOUNDS.minLng &&
    longitude <= TURKEY_BOUNDS.maxLng
  );
}

/** Lower is more precise. */
export function precisionRank(precision: LocationPrecision): number {
  return LOCATION_PRECISIONS.indexOf(precision);
}

export function isMorePrecise(a: LocationPrecision, b: LocationPrecision): boolean {
  return precisionRank(a) < precisionRank(b);
}

/** How far the true place may be from the marker, for drawing the "approximate area" circle. */
export function uncertaintyRadiusMeters(precision: LocationPrecision): number {
  switch (precision) {
    case "exact":
      return 40;
    case "street":
      return 150;
    case "neighborhood":
      return 700;
    case "district":
      return 3_000;
    case "city":
      return 12_000;
    case "region":
      return 60_000;
    case "country":
    case "unknown":
      return 250_000;
  }
}

/** A sensible zoom level for flying to a story of this precision. */
export function zoomForPrecision(precision: LocationPrecision): number {
  switch (precision) {
    case "exact":
    case "street":
      return 15;
    case "neighborhood":
      return 14;
    case "district":
      return 12;
    case "city":
      return 10;
    case "region":
      return 8;
    default:
      return 6;
  }
}

const SENSITIVE_MAX_PRECISION: LocationPrecision = "neighborhood";
/** About 550 m north-south: enough to hide a home address, close enough to stay meaningful. */
const SENSITIVE_GRID_DEGREES = 0.005;

function snap(value: number, grid: number) {
  return Math.round(value / grid) * grid;
}

export interface PublicLocation {
  latitude: number;
  longitude: number;
  precision: LocationPrecision;
}

/**
 * What the public map may show. Sensitive stories (sexual crimes, domestic violence, missing persons or a story
 * the editor marked sensitive) never disclose more than neighborhood level: precise points are snapped to a grid.
 */
export function publicLocation(input: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  precision: LocationPrecision;
  sensitive: boolean;
}): PublicLocation | null {
  const { latitude, longitude } = input;
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (!input.sensitive || !isMorePrecise(input.precision, SENSITIVE_MAX_PRECISION)) {
    return { latitude, longitude, precision: input.precision };
  }
  return {
    latitude: Number(snap(latitude, SENSITIVE_GRID_DEGREES).toFixed(5)),
    longitude: Number(snap(longitude, SENSITIVE_GRID_DEGREES).toFixed(5)),
    precision: SENSITIVE_MAX_PRECISION,
  };
}

/** Great-circle distance in kilometers. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "Mahalle, İlçe, İl" from the parts that are known, most specific first. */
export function formatLocationLabel(parts: {
  street?: string | null;
  neighborhood?: string | null;
  district?: string | null;
  province?: string | null;
  fallback?: string | null;
}): string {
  const seen = new Set<string>();
  const ordered = [parts.neighborhood, parts.district, parts.province]
    .map((part) => part?.trim())
    .filter((part): part is string => {
      if (!part) return false;
      const key = part.toLocaleLowerCase("tr-TR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (ordered.length) return ordered.join(", ");
  return parts.fallback?.trim() || "Türkiye";
}

/** Bounding box [west, south, east, north] around a point, used to query nearby stories. */
export function boundingBox(latitude: number, longitude: number, radiusKm: number) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));
  return {
    west: longitude - lngDelta,
    south: latitude - latDelta,
    east: longitude + lngDelta,
    north: latitude + latDelta,
  };
}
