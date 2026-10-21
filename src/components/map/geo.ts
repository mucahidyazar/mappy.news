import type { Feature, Polygon } from "geojson";

/** A polygon approximating a circle of `radiusMeters` around a point, for the "approximate area" overlay. */
export function circlePolygon(longitude: number, latitude: number, radiusMeters: number, steps = 64): Feature<Polygon> {
  const coordinates: [number, number][] = [];
  const earthRadius = 6_371_008.8;
  const angularDistance = radiusMeters / earthRadius;
  const lat = (latitude * Math.PI) / 180;
  const lng = (longitude * Math.PI) / 180;
  for (let index = 0; index <= steps; index += 1) {
    const bearing = (index / steps) * 2 * Math.PI;
    const pointLat = Math.asin(
      Math.sin(lat) * Math.cos(angularDistance) + Math.cos(lat) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat),
        Math.cos(angularDistance) - Math.sin(lat) * Math.sin(pointLat),
      );
    coordinates.push([(pointLng * 180) / Math.PI, (pointLat * 180) / Math.PI]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coordinates] } };
}
