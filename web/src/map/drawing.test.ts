import type { GeoJSONStoreFeatures } from "terra-draw";
import type { Point } from "geojson";
import { feature } from "../test/fixtures";
import { circlePolygon, distanceMeters, type Position } from "./geodesy";
import type { SymbolInfo } from "../api/geomap";
import { controlPointCount, drawnToInput, modeFor, toDrawFeature, toFeatureInput } from "./drawing";

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

const battlePosition: SymbolInfo = {
  basicId: "25151200",
  name: "Battle Position",
  path: "Control Measure / Maneuver Areas",
  geometry: "AREA",
  minPoints: 3,
  maxPoints: 50,
  modifiers: ["B", "T"],
};
const placed = { symbol: battlePosition, sidc: "10032500001512000000", modifiers: { T: "BP1" } };
const square = {
  type: "Polygon" as const,
  coordinates: [
    [
      [2, 48],
      [3, 48],
      [3, 49],
      [2, 49],
      [2, 48],
    ],
  ],
};

it("maps symbol geometries to drawing modes", () => {
  expect(modeFor("POINT")).toBe("point");
  expect(modeFor("LINE")).toBe("linestring");
  expect(modeFor("AREA")).toBe("polygon");
});

it("counts control points, not the closing vertex", () => {
  expect(controlPointCount(square)).toBe(4);
  expect(controlPointCount({ type: "Point", coordinates: [2, 48] })).toBe(1);
});

it("turns a drawn shape into the placed APP-6D symbol", () => {
  expect(drawnToInput(drawn(square, "polygon"), undefined, placed)).toEqual({
    input: {
      kind: "APP6",
      geometry: square,
      name: "",
      description: "",
      style: null,
      sidc: "10032500001512000000",
      modifiers: { T: "BP1" },
    },
  });
});

it("refuses a symbol drawn with too few points, in French", () => {
  const needsFive = { ...placed, symbol: { ...battlePosition, minPoints: 5 } };
  expect(drawnToInput(drawn(square, "polygon"), undefined, needsFive)).toEqual({
    error: "Ce symbole demande de 5 à 50 points (4 tracés).",
  });
});

it("keeps kind, SIDC and modifiers when an APP-6D object is reshaped", () => {
  const base = feature({
    kind: "APP6",
    sidc: "10032500001512000000",
    modifiers: { T: "BP1" },
    name: "BP nord",
    geometry: square,
  });
  expect(drawnToInput(drawn(square, "polygon"), base)).toMatchObject({
    input: {
      kind: "APP6",
      sidc: "10032500001512000000",
      modifiers: { T: "BP1" },
      name: "BP nord",
    },
  });
});

it("opens an APP-6D object for reshaping in its geometry's mode", () => {
  const point = feature({ kind: "APP6", sidc: "10031000161211000000" });
  expect(toDrawFeature(point)?.properties.mode).toBe("point");
});
