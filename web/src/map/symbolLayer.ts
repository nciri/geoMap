import type * as maplibregl from "maplibre-gl";
import type { LayerSpecification } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { Feature, GraphicCollection } from "../api/geomap";
import { MAP_FONTS } from "./style";

export type Band = "LOW" | "MID" | "HIGH";

export const SYMBOL_SOURCE = "symbols";
export const TACTICAL_SOURCE = "tactical";

// Same limits as the server's RenderBand.forZoom; the zooms sent fall inside each band.
export const ZOOM_FOR_BAND: Record<Band, number> = { LOW: 8, MID: 12, HIGH: 16 };

export function bandOf(zoom: number): Band {
  const level = Math.floor(zoom);
  if (level <= 10) return "LOW";
  return level <= 14 ? "MID" : "HIGH";
}

export function symbolKey(sidc: string, modifiers: Record<string, string> | null): string {
  const entries = Object.entries(modifiers ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return `${sidc}|${entries.map(([key, value]) => `${key}=${value}`).join("&")}`;
}

// MapLibre centres the image on the point; the symbol's own centre is at (anchorX, anchorY).
export function iconOffset(
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
): [number, number] {
  return [width / 2 - anchorX, height / 2 - anchorY];
}

export function pointSymbols(
  features: Feature[],
  offsets: Map<string, [number, number]>,
  hiddenId: string | null = null,
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: features.flatMap((f) => {
      if (f.kind !== "APP6" || !f.sidc || f.geometry.type !== "Point") return [];
      if (f.suggestionStatus === "REJECTED" || f.id === hiddenId) return [];
      const key = symbolKey(f.sidc, f.modifiers);
      const offset = offsets.get(key);
      if (!offset) return [];
      return [
        {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: { id: f.id, icon: key, offset, pending: f.suggestionStatus === "PENDING" },
        },
      ];
    }),
  };
}

const LABEL_FONT_SIZE = 12;

export function tacticalCollection(
  renders: { featureId: string; collection: GraphicCollection }[],
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: renders.flatMap(({ featureId, collection }) =>
      collection.features.map((f) => {
        const p = f.properties ?? {};
        return {
          ...f,
          properties: {
            ...p,
            featureId,
            textAnchor: ["left", "right", "center"].includes(p.labelAlign)
              ? p.labelAlign
              : "center",
            // mil-sym offsets are pixels; MapLibre's text-offset is in ems.
            textOffset: [
              Number(p.anchorOffsetX ?? 0) / LABEL_FONT_SIZE,
              Number(p.anchorOffsetY ?? 0) / LABEL_FONT_SIZE,
            ],
          },
        };
      }),
    ),
  };
}

export const SYMBOL_LAYERS: LayerSpecification[] = [
  {
    id: "tactical-line",
    type: "line",
    source: TACTICAL_SOURCE,
    filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
    paint: {
      "line-color": ["coalesce", ["get", "strokeColor"], "#000000"],
      "line-width": ["coalesce", ["get", "strokeWidth"], 2],
    },
  },
  {
    id: "tactical-label",
    type: "symbol",
    source: TACTICAL_SOURCE,
    filter: ["==", ["geometry-type"], "Point"],
    layout: {
      "text-field": ["get", "label"],
      "text-font": [MAP_FONTS[1]],
      "text-size": LABEL_FONT_SIZE,
      "text-anchor": ["get", "textAnchor"],
      "text-offset": ["get", "textOffset"],
      "text-rotate": ["coalesce", ["get", "rotation"], 0],
      "text-rotation-alignment": "map",
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": ["coalesce", ["get", "fontColor"], "#000000"],
      "text-halo-color": ["coalesce", ["get", "labelOutlineColor"], "#ffffff"],
      "text-halo-width": 2,
    },
  },
  {
    id: "mission-symbol",
    type: "symbol",
    source: SYMBOL_SOURCE,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-offset": ["get", "offset"],
      "icon-allow-overlap": true,
    },
    paint: { "icon-opacity": ["case", ["get", "pending"], 0.6, 1] },
  },
];

export const SYMBOL_CLICKABLE_LAYERS = ["mission-symbol", "tactical-line"];

export function addSymbolLayers(map: maplibregl.Map): void {
  const empty = { type: "FeatureCollection" as const, features: [] };
  map.addSource(SYMBOL_SOURCE, { type: "geojson", data: empty });
  map.addSource(TACTICAL_SOURCE, { type: "geojson", data: empty });
  for (const layer of SYMBOL_LAYERS) map.addLayer(layer);
}
