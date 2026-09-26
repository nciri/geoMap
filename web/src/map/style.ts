import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";
import { basemapTilesUrl } from "../api/geomap";

export const BASEMAP_SOURCE = "basemap";
export const MAP_FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];

export function absoluteTilesUrl(basemapId: string): string {
  return location.origin + basemapTilesUrl(basemapId);
}

export function basemapStyle(basemapId: string | null): StyleSpecification {
  const assets = `${location.origin}/map-assets`;
  const base = {
    version: 8 as const,
    glyphs: `${assets}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${assets}/sprites/v4/light`,
  };
  if (!basemapId) {
    return {
      ...base,
      sources: {},
      layers: [{ id: "background", type: "background", paint: { "background-color": "#e8e4d8" } }],
    };
  }
  return {
    ...base,
    sources: {
      [BASEMAP_SOURCE]: {
        type: "vector",
        url: `pmtiles://${absoluteTilesUrl(basemapId)}`,
        attribution: "© OpenStreetMap",
      },
    },
    layers: layers(BASEMAP_SOURCE, namedFlavor("light"), { lang: "fr" }),
  };
}
