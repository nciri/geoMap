import type { GeoJSONStoreFeatures } from "terra-draw";
import type { Point } from "geojson";
import { feature } from "../test/fixtures";
import { circlePolygon, distanceMeters, type Position } from "./geodesy";
import { drawnToInput, toDrawFeature, toFeatureInput } from "./drawing";

const drawn = (geometry: GeoJSONStoreFeatures["geometry"], mode: string, extra = {}) =>
  ({
    type: "Feature",
    id: "td-1",
    geometry,
    properties: { mode, ...extra },
  }) as GeoJSONStoreFeatures;

it("turns a drawn point, line or zone into a generic object", () => {
  const line = drawn(
    {
      type: "LineString",
      coordinates: [
        [2, 48],
        [2.1, 48.1],
      ],
    },
    "linestring",
  );
  expect(toFeatureInput(line)).toEqual({
    kind: "GENERIC",
    geometry: {
      type: "LineString",
      coordinates: [
        [2, 48],
        [2.1, 48.1],
      ],
    },
    name: "",
    description: "",
    style: null,
  });
});

it("stores a drawn circle as its centre and radius", () => {
  const input = toFeatureInput(drawn(circlePolygon([2.35, 48.85], 1500), "circle"));
  expect(input.geometry.type).toBe("Point");
  const center = (input.geometry as Point).coordinates as Position;
  expect(distanceMeters(center, [2.35, 48.85])).toBeLessThan(1);
  expect(Math.abs((input.style?.radiusMeters ?? 0) - 1500)).toBeLessThan(1);
});

it("keeps the name, description and colour of the object being reshaped", () => {
  const base = feature({
    name: "PC",
    description: "abri",
    style: { color: "#40a02b", radiusMeters: 500 },
  });
  const input = toFeatureInput(drawn(circlePolygon([2.35, 48.85], 700), "circle"), base);
  expect(input).toMatchObject({ name: "PC", description: "abri", style: { color: "#40a02b" } });
  expect(Math.abs((input.style?.radiusMeters ?? 0) - 700)).toBeLessThan(1);
});

it("opens a saved circle for editing as a Terra Draw circle", () => {
  const editable = toDrawFeature(feature({ id: "c", style: { radiusMeters: 1000 } }));
  expect(editable).toMatchObject({ id: "c", properties: { mode: "circle", radiusKilometers: 1 } });
  expect(editable?.geometry.type).toBe("Polygon");
});

it("rounds coordinates to the precision Terra Draw accepts", () => {
  const editable = toDrawFeature(feature({ style: { radiusMeters: 1234.5 } }));
  const decimals = JSON.stringify(editable?.geometry.coordinates).match(/\.\d+/g) ?? [];
  for (const d of decimals) expect(d.length - 1).toBeLessThanOrEqual(9);
});

it("maps saved geometries to their drawing mode", () => {
  expect(toDrawFeature(feature())?.properties.mode).toBe("point");
  const line = feature({
    geometry: {
      type: "LineString",
      coordinates: [
        [2, 48],
        [3, 49],
      ],
    },
  });
  expect(toDrawFeature(line)?.properties.mode).toBe("linestring");
  expect(toDrawFeature(feature({ kind: "APP6", sidc: "10031000001211000000" }))).toBeNull();
});

it("reports a degenerate circle in French instead of throwing", () => {
  const point: Position = [2.35, 48.85];
  const ring = drawn({ type: "Polygon", coordinates: [[point, point, point, point]] }, "circle");
  expect(drawnToInput(ring)).toEqual({
    error: "Forme invalide : un cercle demande au moins trois sommets distincts.",
  });
  expect(drawnToInput(drawn(circlePolygon(point, 500), "circle"))).toHaveProperty("input");
});

it("opens a saved zone as a Terra Draw polygon with coordinates it accepts", () => {
  const zone = feature({
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [2.123456789123, 48.1],
          [2.2, 48.987654321987],
          [2.3, 48.2],
          [2.123456789123, 48.1],
        ],
      ],
    },
  });
  const editable = toDrawFeature(zone);
  expect(editable?.properties.mode).toBe("polygon");
  expect(editable?.geometry.coordinates).toEqual([
    [
      [2.123456789, 48.1],
      [2.2, 48.987654322],
      [2.3, 48.2],
      [2.123456789, 48.1],
    ],
  ]);
});
