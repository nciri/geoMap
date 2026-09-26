import {
  circleFromRing,
  circlePolygon,
  destination,
  distanceMeters,
  type Position,
} from "./geodesy";

const paris: Position = [2.35, 48.85];

it("moves a given distance along a bearing", () => {
  const north = destination(paris, 1000, 0);
  expect(north[0]).toBeCloseTo(2.35, 9);
  expect(distanceMeters(paris, north)).toBeCloseTo(1000, 2);
  expect(distanceMeters(paris, destination(paris, 2500, 135))).toBeCloseTo(2500, 2);
});

it("builds a closed ring whose vertices sit on the circle", () => {
  const ring = circlePolygon(paris, 2500).coordinates[0] as Position[];
  expect(ring).toHaveLength(65);
  expect(ring[0]).toEqual(ring[64]);
  for (const vertex of ring) expect(distanceMeters(paris, vertex)).toBeCloseTo(2500, 1);
});

it("recovers centre and radius from a drawn ring within one metre", () => {
  const ring = circlePolygon(paris, 2500).coordinates[0] as Position[];
  const { center, radiusMeters } = circleFromRing(ring);
  expect(distanceMeters(center, paris)).toBeLessThan(1);
  expect(Math.abs(radiusMeters - 2500)).toBeLessThan(1);
});
