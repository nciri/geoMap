import { existsSync } from "node:fs";
import { basemapStyle, BASEMAP_SOURCE, isOverlay, MAP_FONTS } from "./style";

const vector = { id: "zone-nord", name: "Zone Nord", attribution: "© OpenStreetMap" };
const paris = { id: "paris-ortho", name: "Paris", attribution: "© IGN" };
const lyon = { id: "lyon-ortho", name: "Lyon", attribution: "© IGN" };

function fontsUsed(style: ReturnType<typeof basemapStyle>): Set<string> {
  const fonts = style.layers.map(
    (l) => (l as { layout?: Record<string, unknown> }).layout?.["text-font"],
  );
  return new Set(JSON.stringify(fonts).match(/Noto Sans [A-Za-z]+/g) ?? []);
}

it("loads every resource from the app's own origin", () => {
  const style = basemapStyle({ vector, imagery: [paris] });
  expect(style.glyphs).toBe(`${location.origin}/map-assets/fonts/{fontstack}/{range}.pbf`);
  expect(style.sprite).toBe(`${location.origin}/map-assets/sprites/v4/light`);
  expect(style.sources[BASEMAP_SOURCE]).toMatchObject({
    type: "vector",
    url: `pmtiles://${location.origin}/api/basemaps/zone-nord/pmtiles`,
  });
  const urls = JSON.stringify(style).match(/[a-z]+:\/\/[^"]*/g) ?? [];
  for (const url of urls) {
    expect(url.startsWith(location.origin) || url.startsWith(`pmtiles://${location.origin}`)).toBe(
      true,
    );
  }
});

it("labels the map in French with the fonts shipped in public/map-assets", () => {
  const style = basemapStyle({ vector, imagery: [] });
  expect(style.layers.length).toBeGreaterThan(10);
  const used = fontsUsed(style);
  expect(used.size).toBeGreaterThan(0);
  for (const font of used) expect(MAP_FONTS).toContain(font);
  for (const font of MAP_FONTS) {
    for (const range of ["0-255", "256-511", "8192-8447"]) {
      expect(existsSync(`public/map-assets/fonts/${font}/${range}.pbf`)).toBe(true);
    }
  }
  expect(existsSync("public/map-assets/sprites/v4/light.json")).toBe(true);
  expect(existsSync("public/map-assets/sprites/v4/light@2x.png")).toBe(true);
});

it("shows a plain background when the mission has no basemap", () => {
  const style = basemapStyle({ vector: null, imagery: [] });
  expect(style.sources).toEqual({});
  expect(style.layers).toEqual([expect.objectContaining({ type: "background" })]);
});

it("stacks base layers, imagery in order, then roads and labels", () => {
  const style = basemapStyle({ vector, imagery: [paris, lyon] });
  const ids = style.layers.map((l) => l.id);
  const first = ids.indexOf("imagery-paris-ortho");
  expect(ids.indexOf("imagery-lyon-ortho")).toBe(first + 1);
  expect(style.layers.slice(0, first).every((l) => !isOverlay(l))).toBe(true);
  expect(style.layers.slice(first + 2).every((l) => isOverlay(l))).toBe(true);
  expect(style.sources["imagery-paris-ortho"]).toMatchObject({
    type: "raster",
    url: `pmtiles://${location.origin}/api/basemaps/paris-ortho/pmtiles`,
    tileSize: 256,
    attribution: "© IGN",
  });
  expect(style.sources.basemap).toMatchObject({ attribution: "© OpenStreetMap" });
});

it("classifies roads, boundaries and every text as overlay", () => {
  const overlay = basemapStyle({ vector, imagery: [] })
    .layers.filter(isOverlay)
    .map((l) => l.id);
  expect(overlay).toContain("roads_highway");
  expect(overlay).toContain("boundaries_country");
  expect(overlay).toContain("places_locality");
  expect(overlay).not.toContain("water");
  expect(overlay).not.toContain("earth");
});

it("still shows imagery without a vector basemap", () => {
  const style = basemapStyle({ vector: null, imagery: [paris] });
  expect(style.layers.map((l) => l.id)).toEqual(["background", "imagery-paris-ortho"]);
});

it("hands MapLibre attributions as escaped text, with entities decoded", () => {
  const hostile = {
    id: "paris-ortho",
    name: "Paris",
    attribution: '<img src=x onerror="alert(1)">&copy; IGN <script>alert(2)</script>',
  };
  const style = basemapStyle({
    vector: { ...vector, attribution: "&copy; OpenStreetMap" },
    imagery: [hostile],
  });
  expect(style.sources[BASEMAP_SOURCE]).toMatchObject({ attribution: "© OpenStreetMap" });
  const imagery = (style.sources["imagery-paris-ortho"] as { attribution: string }).attribution;
  expect(imagery).not.toMatch(/<|>/);
  expect(imagery).toContain("© IGN");
});
