import type * as maplibregl from "maplibre-gl";
import type { LayerSpecification } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { Feature, GraphicCollection } from "../api/geomap";
import { MAP_FONTS } from "./style";

export type Band = "LOW" | "MID" | "HIGH";

export const SYMBOL_SOURCE = "symbols";
export const TACTICAL_SOURCE = "tactical";
export const FALLBACK_SOURCE = "symbol-fallbacks";

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

// MapLibre centres the image on the point, and a per-feature icon-offset does not survive the
// worker (GeoJSON properties arrive as strings); padding the image puts the symbol's anchor
// (anchorX, anchorY) at its centre. (dx, dy) is where the bitmap is drawn in the padded image.
export function anchoredCanvasLayout(
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
): { width: number; height: number; dx: number; dy: number } {
  const halfWidth = Math.ceil(Math.max(anchorX, width - anchorX));
  const halfHeight = Math.ceil(Math.max(anchorY, height - anchorY));
  return {
    width: 2 * halfWidth,
    height: 2 * halfHeight,
    dx: halfWidth - anchorX,
    dy: halfHeight - anchorY,
  };
}

type App6Point = Feature & { sidc: string; geometry: Point };

const drawnPoints = (features: Feature[], hiddenId: string | null) =>
  features.filter(
    (f): f is App6Point =>
      f.kind === "APP6" &&
      !!f.sidc &&
      f.geometry.type === "Point" &&
      f.suggestionStatus !== "REJECTED" &&
      f.id !== hiddenId,
  );

export const symbolLabel = (f: Feature) => f.name || (f.sidc ?? "");

export function pointSymbols(
  features: Feature[],
  loaded: ReadonlySet<string>,
  hiddenId: string | null = null,
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: drawnPoints(features, hiddenId).flatMap((f) => {
      const key = symbolKey(f.sidc, f.modifiers);
      if (!loaded.has(key)) return [];
      return [
        {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: {
            id: f.id,
            icon: key,
            pending: f.suggestionStatus === "PENDING",
            label: symbolLabel(f),
          },
        },
      ];
    }),
  };
}

// A unit must stay on the map while its icon loads or when it cannot be fetched.
export function pointFallbacks(
  features: Feature[],
  loaded: ReadonlySet<string>,
  hiddenId: string | null = null,
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: drawnPoints(features, hiddenId)
      .filter((f) => !loaded.has(symbolKey(f.sidc, f.modifiers)))
      .map((f) => ({
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {
          id: f.id,
          label: symbolLabel(f),
          pending: f.suggestionStatus === "PENDING",
        },
      })),
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
            // mil-sym's few-pixel anchorOffset nudge is dropped: an array-valued text-offset
            // property reaches MapLibre as a string and is ignored anyway.
            textAnchor: ["left", "right", "center"].includes(p.labelAlign)
              ? p.labelAlign
              : "center",
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
    id: "mission-symbol-fallback",
    type: "circle",
    source: FALLBACK_SOURCE,
    paint: {
      "circle-radius": 6,
      "circle-color": "#6c6f85",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-opacity": ["case", ["get", "pending"], 0.6, 1],
    },
  },
  {
    id: "mission-symbol-fallback-label",
    type: "symbol",
    source: FALLBACK_SOURCE,
    layout: {
      "text-field": ["get", "label"],
      "text-font": [MAP_FONTS[0]],
      "text-size": LABEL_FONT_SIZE,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
    },
    paint: { "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  },
  {
    id: "mission-symbol",
    type: "symbol",
    source: SYMBOL_SOURCE,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-allow-overlap": true,
      "text-field": ["get", "label"],
      "text-font": [MAP_FONTS[0]],
      "text-size": LABEL_FONT_SIZE,
      // Below the 64 px icon, whose centre sits on the position.
      "text-offset": [0, 2.8],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: {
      "icon-opacity": ["case", ["get", "pending"], 0.6, 1],
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  },
];

export const SYMBOL_CLICKABLE_LAYERS = [
  "mission-symbol",
  "mission-symbol-fallback",
  "tactical-line",
];

export function addSymbolLayers(map: maplibregl.Map): void {
  const empty = { type: "FeatureCollection" as const, features: [] };
  map.addSource(SYMBOL_SOURCE, { type: "geojson", data: empty });
  map.addSource(TACTICAL_SOURCE, { type: "geojson", data: empty });
  map.addSource(FALLBACK_SOURCE, { type: "geojson", data: empty });
  for (const layer of SYMBOL_LAYERS) map.addLayer(layer);
}
