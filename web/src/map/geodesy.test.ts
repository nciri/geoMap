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

// Terra Draw's select mode resizes circles in Web Mercator space.
function mercatorCircleRing([lon, lat]: Position, meters: number, steps = 64): Position[] {
  const R = 6_378_137;
  const x0 = (R * lon * Math.PI) / 180;
  const y0 = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const r = meters / Math.cos((lat * Math.PI) / 180);
  const ring = Array.from({ length: steps }, (_, i): Position => {
    const angle = (2 * Math.PI * i) / steps;
    const x = x0 + r * Math.cos(angle);
    const y = y0 + r * Math.sin(angle);
    return [
      (x / R) * (180 / Math.PI),
      (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
    ];
  });
  return [...ring, ring[0]];
}

it.each([20_000, 50_000])("recovers a %i m geodesic circle within one metre", (meters) => {
  const ring = circlePolygon(paris, meters).coordinates[0] as Position[];
  const { center, radiusMeters } = circleFromRing(ring);
  expect(distanceMeters(center, paris)).toBeLessThan(1);
  expect(Math.abs(radiusMeters - meters)).toBeLessThan(1);
});

it("recovers the centre of a Web Mercator circle within one metre", () => {
  const { center } = circleFromRing(mercatorCircleRing(paris, 20_000));
  expect(distanceMeters(center, paris)).toBeLessThan(1);
});

it("rejects a ring that is not a circle", () => {
  expect(() => circleFromRing([])).toThrow(/cercle|circle/i);
  expect(() => circleFromRing([paris, paris, paris, paris])).toThrow(/cercle|circle/i);
});
