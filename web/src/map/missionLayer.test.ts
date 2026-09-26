import type { Polygon } from "geojson";
import { feature } from "../test/fixtures";
import { distanceMeters, type Position } from "./geodesy";
import { boundsOf, DEFAULT_COLOR, MISSION_LAYERS, toFeatureCollection } from "./missionLayer";
import { MAP_FONTS } from "./style";

it("draws generic objects with their colour and name", () => {
  const collection = toFeatureCollection([
    feature({ id: "a", name: "PC", style: { color: "#40a02b" } }),
    feature({ id: "b", name: "" }),
  ]);
  expect(collection.features.map((f) => f.properties)).toEqual([
    { id: "a", label: "PC", color: "#40a02b", pending: false },
    { id: "b", label: "", color: DEFAULT_COLOR, pending: false },
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
