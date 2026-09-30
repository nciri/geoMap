import { layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { basemapTilesUrl } from "../api/geomap";

export const BASEMAP_SOURCE = "basemap";
export const MAP_FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
export const IMAGERY_PREFIX = "imagery-";

export interface StackLayer {
  id: string;
  name: string;
  attribution: string;
}

export function absoluteTilesUrl(basemapId: string): string {
  return location.origin + basemapTilesUrl(basemapId);
}

// Roads, boundaries and every text sit above imagery in Hybride and disappear in Satellite.
export function isOverlay(layer: LayerSpecification): boolean {
  return (
    layer.type === "symbol" || layer.id.startsWith("roads_") || layer.id.startsWith("boundaries")
  );
}

export function basemapStyle(stack: {
  vector: StackLayer | null;
  imagery: StackLayer[];
}): StyleSpecification {
  const assets = `${location.origin}/map-assets`;
  const vectorLayers = stack.vector
    ? layers(BASEMAP_SOURCE, namedFlavor("light"), { lang: "fr" })
    : [];
  const base: LayerSpecification[] = stack.vector
    ? vectorLayers.filter((l) => !isOverlay(l))
    : [{ id: "background", type: "background", paint: { "background-color": "#e8e4d8" } }];
  const imageryLayers: LayerSpecification[] = stack.imagery.map((layer) => ({
    id: IMAGERY_PREFIX + layer.id,
    type: "raster",
    source: IMAGERY_PREFIX + layer.id,
  }));
  return {
    version: 8,
    glyphs: `${assets}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${assets}/sprites/v4/light`,
    sources: {
      ...(stack.vector
        ? {
            [BASEMAP_SOURCE]: {
              type: "vector" as const,
              url: `pmtiles://${absoluteTilesUrl(stack.vector.id)}`,
              attribution: stack.vector.attribution,
            },
          }
        : {}),
      ...Object.fromEntries(
        stack.imagery.map((layer) => [
          IMAGERY_PREFIX + layer.id,
          {
            type: "raster" as const,
            url: `pmtiles://${absoluteTilesUrl(layer.id)}`,
            tileSize: 256,
            attribution: layer.attribution,
          },
        ]),
      ),
    },
    layers: [...base, ...imageryLayers, ...vectorLayers.filter(isOverlay)],
  };
}
