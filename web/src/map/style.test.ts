import { existsSync } from "node:fs";
import { basemapStyle, BASEMAP_SOURCE, MAP_FONTS } from "./style";

function fontsUsed(style: ReturnType<typeof basemapStyle>): Set<string> {
  const fonts = style.layers.map(
    (l) => (l as { layout?: Record<string, unknown> }).layout?.["text-font"],
  );
  return new Set(JSON.stringify(fonts).match(/Noto Sans [A-Za-z]+/g) ?? []);
}

it("loads every resource from the app's own origin", () => {
  const style = basemapStyle("zone-nord");
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
  const style = basemapStyle("zone-nord");
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
  const style = basemapStyle(null);
  expect(style.sources).toEqual({});
  expect(style.layers).toEqual([expect.objectContaining({ type: "background" })]);
});
