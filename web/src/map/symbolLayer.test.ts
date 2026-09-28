import { feature } from "../test/fixtures";
import {
  bandOf,
  iconOffset,
  pointSymbols,
  symbolKey,
  SYMBOL_LAYERS,
  tacticalCollection,
} from "./symbolLayer";
import { MAP_FONTS } from "./style";

it("picks the server's zoom bands", () => {
  expect([0, 10, 10.9, 11, 14.99, 15, 22].map(bandOf)).toEqual([
    "LOW",
    "LOW",
    "LOW",
    "MID",
    "MID",
    "HIGH",
    "HIGH",
  ]);
});

it("keys icons by SIDC and modifiers regardless of order", () => {
  expect(symbolKey("10031000161211000000", { T: "1", H: "x" })).toBe(
    symbolKey("10031000161211000000", { H: "x", T: "1" }),
  );
  expect(symbolKey("10031000161211000000", null)).not.toBe(
    symbolKey("10031000161211000000", { T: "1" }),
  );
});

it("shifts the icon so its anchor, not its centre, sits on the position", () => {
  expect(iconOffset(40, 33, 80, 60)).toEqual([0, -3]);
  expect(iconOffset(10, 10, 20, 20)).toEqual([0, 0]);
});

it("lists APP-6D points whose icon is ready, with their offset", () => {
  const unit = feature({
    id: "u",
    kind: "APP6",
    sidc: "10031000161211000000",
    modifiers: { T: "1" },
  });
  const line = feature({
    id: "l",
    kind: "APP6",
    sidc: "10032500001401000000",
    geometry: {
      type: "LineString",
      coordinates: [
        [2, 48],
        [3, 48],
      ],
    },
  });
  const key = symbolKey(unit.sidc!, unit.modifiers);
  const collection = pointSymbols([unit, line, feature()], new Map([[key, [0, -3]]]));
  expect(collection.features.map((f) => f.properties)).toEqual([
    { id: "u", icon: key, offset: [0, -3], pending: false },
  ]);
  expect(pointSymbols([unit], new Map()).features).toEqual([]);
});

it("turns mil-sym label placement into MapLibre text properties", () => {
  const collection = tacticalCollection([
    {
      featureId: "l",
      collection: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [2, 48] },
            properties: { label: "BP1", labelAlign: "right", anchorOffsetX: -6, anchorOffsetY: 6 },
          },
        ],
      },
    },
  ]);
  expect(collection.features[0].properties).toMatchObject({
    featureId: "l",
    label: "BP1",
    textAnchor: "right",
    textOffset: [-0.5, 0.5],
  });
});

it("labels tactical graphics with a shipped font", () => {
  const label = SYMBOL_LAYERS.find((l) => l.id === "tactical-label") as {
    layout?: Record<string, unknown>;
  };
  expect(MAP_FONTS).toContain((label.layout?.["text-font"] as string[])[0]);
});
