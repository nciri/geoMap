import type { Polygon } from "geojson";
import { feature } from "../test/fixtures";
import { distanceMeters, type Position } from "./geodesy";
import {
  boundsOf,
  CLICKABLE_LAYERS,
  DEFAULT_COLOR,
  isCircle,
  MISSION_LAYERS,
  toFeatureCollection,
} from "./missionLayer";
import { MAP_FONTS } from "./style";

it("draws generic objects with their colour and name", () => {
  const collection = toFeatureCollection([
    feature({ id: "a", name: "PC", style: { color: "#40a02b" } }),
    feature({ id: "b", name: "" }),
  ]);
  expect(collection.features.map((f) => f.properties)).toEqual([
    { id: "a", label: "PC", color: "#40a02b", pending: false, kind: "GENERIC" },
    { id: "b", label: "", color: DEFAULT_COLOR, pending: false, kind: "GENERIC" },
  ]);
});

it("draws a circle as a polygon of its radius", () => {
  const [circle] = toFeatureCollection([feature({ style: { radiusMeters: 800 } })]).features;
  expect(circle.geometry.type).toBe("Polygon");
  const ring = (circle.geometry as Polygon).coordinates[0] as Position[];
  expect(distanceMeters([2.35, 48.85], ring[0])).toBeCloseTo(800, 0);
});

it("flags pending suggestions and leaves rejected ones and the edited object out", () => {
  const collection = toFeatureCollection(
    [
      feature({ id: "p", origin: "AI_SUGGESTED", suggestionStatus: "PENDING" }),
      feature({ id: "r", origin: "AI_SUGGESTED", suggestionStatus: "REJECTED" }),
      feature({ id: "e" }),
    ],
    "e",
  );
  expect(collection.features.map((f) => [f.properties.id, f.properties.pending])).toEqual([
    ["p", true],
  ]);
});

it("labels an unnamed APP-6D object with its SIDC", () => {
  const [symbol] = toFeatureCollection([
    feature({ kind: "APP6", name: "", sidc: "10031000001211000000" }),
  ]).features;
  expect(symbol.properties.label).toBe("10031000001211000000");
});

it("frames every visible object", () => {
  expect(boundsOf([])).toBeNull();
  expect(
    boundsOf([
      feature({ bbox: { minLon: 1, minLat: 2, maxLon: 3, maxLat: 4 } }),
      feature({ bbox: { minLon: -1, minLat: 3, maxLon: 2, maxLat: 5 } }),
      feature({
        suggestionStatus: "REJECTED",
        bbox: { minLon: -50, minLat: -50, maxLon: 50, maxLat: 50 },
      }),
    ]),
  ).toEqual([
    [-1, 2],
    [3, 5],
  ]);
});

it("labels objects with a shipped font", () => {
  const label = MISSION_LAYERS.find((l) => l.id === "mission-label") as {
    layout?: Record<string, unknown>;
  };
  expect(label.layout?.["text-font"]).toEqual([MAP_FONTS[0]]);
});

it("recognises a circle only as a point with a positive radius", () => {
  expect(isCircle(feature({ style: { radiusMeters: 250 } }))).toBe(true);
  expect(isCircle(feature({ style: { radiusMeters: 0 } }))).toBe(false);
  expect(isCircle(feature({ style: { radiusMeters: -5 } }))).toBe(false);
  expect(isCircle(feature({ style: { color: "#40a02b" } }))).toBe(false);
  expect(isCircle(feature({ style: null }))).toBe(false);
  const line = feature({
    geometry: {
      type: "LineString",
      coordinates: [
        [2, 48],
        [3, 49],
      ],
    },
    style: { radiusMeters: 250 },
  });
  expect(isCircle(line)).toBe(false);
});

it("tags objects with their kind and keeps APP-6D control lines clickable", () => {
  const collection = toFeatureCollection([
    feature({ id: "g" }),
    feature({ id: "a", kind: "APP6", sidc: "10031000161211000000" }),
  ]);
  expect(collection.features.map((f) => [f.properties.id, f.properties.kind])).toEqual([
    ["g", "GENERIC"],
    ["a", "APP6"],
  ]);
  expect(MISSION_LAYERS.map((l) => l.id)).toContain("mission-app6-control");
  expect(CLICKABLE_LAYERS).toContain("mission-app6-control");
});
