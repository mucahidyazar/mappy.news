import type { GeocodeResult } from "@/lib/domain/types";

/** Degrees; the box a search is restricted to (a district, a neighborhood). */
export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GeocodeCandidate extends GeocodeResult {
  /** The object's own name ("Forum İstanbul"), when it has one. */
  name?: string | null;
  street: string | null;
  importance: number;
  placeRank: number;
  bbox?: BoundingBox | null;
  /** The OSM class and type ("amenity:school", "highway:residential"), when the service reports it. */
  kind?: string | null;
  /** A street segment's geometry as [longitude, latitude] lines, when it was asked for. */
  lines?: Array<Array<[number, number]>> | null;
}

export function boxContains(box: BoundingBox, point: { latitude: number; longitude: number }) {
  return point.latitude >= box.south && point.latitude <= box.north && point.longitude >= box.west && point.longitude <= box.east;
}

/** Grows a box by a share of its size on every side (search a little beyond a district's edge). */
export function expandBox(box: BoundingBox, share: number): BoundingBox {
  const dLat = (box.north - box.south) * share;
  const dLng = (box.east - box.west) * share;
  return { west: box.west - dLng, south: box.south - dLat, east: box.east + dLng, north: box.north + dLat };
}

/** Corner to corner, in kilometers: how big a place is. */
export function boxSizeKm(box: BoundingBox): number {
  const midLat = (((box.north + box.south) / 2) * Math.PI) / 180;
  const height = (box.north - box.south) * 111.32;
  const width = (box.east - box.west) * 111.32 * Math.cos(midLat);
  return Math.hypot(height, width);
}

/** A square box around a point, for places a service returned without one. */
export function boxAround(point: { latitude: number; longitude: number }, radiusKm: number): BoundingBox {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.01));
  return { west: point.longitude - dLng, south: point.latitude - dLat, east: point.longitude + dLng, north: point.latitude + dLat };
}
