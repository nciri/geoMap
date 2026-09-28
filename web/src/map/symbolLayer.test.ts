import { feature } from "../test/fixtures";
import {
  bandOf,
  anchoredCanvasLayout,
  pointFallbacks,
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

it("pads the icon so its anchor, not its centre, sits on the position", () => {
  expect(anchoredCanvasLayout(40, 33, 80, 60)).toEqual({ width: 80, height: 66, dx: 0, dy: 0 });
  expect(anchoredCanvasLayout(10, 10, 20, 20)).toEqual({ width: 20, height: 20, dx: 0, dy: 0 });
  expect(anchoredCanvasLayout(5, 50, 20, 60)).toEqual({ width: 30, height: 100, dx: 10, dy: 0 });
  // A fractional anchor still lands on the centre of a whole-pixel image.
  expect(anchoredCanvasLayout(10.5, 10, 20, 20)).toEqual({
    width: 22,
    height: 20,
    dx: 0.5,
    dy: 0,
  });
});

it("keeps array-valued offsets out of layer properties, which the worker stringifies", () => {
  for (const layer of SYMBOL_LAYERS) {
    const layout = (layer as { layout?: Record<string, unknown> }).layout ?? {};
    for (const key of ["icon-offset", "text-offset"]) {
      expect(JSON.stringify(layout[key] ?? null)).not.toContain('"get"');
    }
  }
});

it("lists APP-6D points whose icon is ready", () => {
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
  const collection = pointSymbols([unit, line, feature()], new Set([key]));
  expect(collection.features.map((f) => f.properties)).toEqual([
    { id: "u", icon: key, pending: false, label: "PC avancé" },
  ]);
  expect(pointSymbols([unit], new Set()).features).toEqual([]);
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
  });
  expect(collection.features[0].properties).not.toHaveProperty("textOffset");
});

it("labels tactical graphics with a shipped font", () => {
  const label = SYMBOL_LAYERS.find((l) => l.id === "tactical-label") as {
    layout?: Record<string, unknown>;
  };
  expect(MAP_FONTS).toContain((label.layout?.["text-font"] as string[])[0]);
});

it("keeps APP-6D points without a loaded icon on the map as named markers", () => {
  const loaded = feature({ id: "ok", kind: "APP6", sidc: "10031000161211000000" });
  const waiting = feature({ id: "w", kind: "APP6", name: "", sidc: "10031000001211000000" });
  const pending = feature({
    id: "p",
    kind: "APP6",
    sidc: "10031000001211000000",
    suggestionStatus: "PENDING",
  });
  const rejected = feature({
    id: "r",
    kind: "APP6",
    sidc: "10031000001211000000",
    suggestionStatus: "REJECTED",
  });
  const hidden = feature({ id: "h", kind: "APP6", sidc: "10031000001211000000" });
  const collection = pointFallbacks(
    [loaded, waiting, pending, rejected, hidden, feature()],
    new Set([symbolKey(loaded.sidc!, null)]),
    "h",
  );
  expect(collection.features.map((f) => f.properties)).toEqual([
    { id: "w", label: "10031000001211000000", pending: false },
    { id: "p", label: "PC avancé", pending: true },
  ]);
});

it("names APP-6D icons under the symbol and never hides the icon for its label", () => {
  const symbol = SYMBOL_LAYERS.find((l) => l.id === "mission-symbol") as {
    layout?: Record<string, unknown>;
  };
  expect(symbol.layout?.["text-field"]).toEqual(["get", "label"]);
  expect(symbol.layout?.["text-font"]).toEqual([MAP_FONTS[0]]);
  expect(symbol.layout?.["text-optional"]).toBe(true);
});
