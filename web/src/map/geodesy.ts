import type { Polygon } from "geojson";

export type Position = [number, number];

const EARTH_RADIUS_METERS = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function destination([lon, lat]: Position, meters: number, bearingDeg: number): Position {
  const angle = meters / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(lat);
  const lon1 = toRadians(lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angle) + Math.cos(lat1) * Math.sin(angle) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angle) * Math.cos(lat1),
      Math.cos(angle) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [((toDegrees(lon2) + 540) % 360) - 180, toDegrees(lat2)];
}

export function distanceMeters([lon1, lat1]: Position, [lon2, lat2]: Position): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function circlePolygon(center: Position, radiusMeters: number, steps = 64): Polygon {
  const ring = Array.from({ length: steps }, (_, i) =>
    destination(center, radiusMeters, (360 * i) / steps),
  );
  return { type: "Polygon", coordinates: [[...ring, ring[0]]] };
}

// ponytail: centre = mean of the vertices, within a metre for the regular rings Terra Draw
// draws; wrong across the antimeridian or near the poles, where no mission area lies today.
export function circleFromRing(ring: Position[]): { center: Position; radiusMeters: number } {
  const vertices = ring.slice(0, -1);
  const center: Position = [
    vertices.reduce((sum, [lon]) => sum + lon, 0) / vertices.length,
    vertices.reduce((sum, [, lat]) => sum + lat, 0) / vertices.length,
  ];
  const radiusMeters =
    vertices.reduce((sum, vertex) => sum + distanceMeters(center, vertex), 0) / vertices.length;
  return { center, radiusMeters };
}
