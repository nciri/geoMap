import type * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import type { FeatureCollection, Geometry as GeoGeometry } from "geojson";
import type { Feature } from "../api/geomap";
import { circlePolygon, type Position } from "./geodesy";
import type { LngLatBounds2 } from "./MapView";
import { MAP_FONTS } from "./style";

export const MISSION_SOURCE = "mission";
export const DEFAULT_COLOR = "#1e66f5";
export const SUGGESTION_COLOR = "#df8e1d";

interface MissionFeatureProperties {
  id: string;
  label: string;
  color: string;
  pending: boolean;
}

const isVisible = (f: Feature) => f.suggestionStatus !== "REJECTED";

function displayGeometry(f: Feature): GeoGeometry {
  const radius = f.style?.radiusMeters;
  if (f.geometry.type === "Point" && radius) {
    return circlePolygon(f.geometry.coordinates.slice(0, 2) as Position, radius);
  }
  return f.geometry;
}

export function toFeatureCollection(
  features: Feature[],
  hiddenId: string | null = null,
): FeatureCollection<GeoGeometry, MissionFeatureProperties> {
  return {
    type: "FeatureCollection",
    features: features
      .filter((f) => isVisible(f) && f.id !== hiddenId)
      .map((f) => ({
        type: "Feature",
        geometry: displayGeometry(f),
        properties: {
          id: f.id,
          label: f.name || (f.kind === "APP6" ? (f.sidc ?? "") : ""),
          color: f.style?.color ?? DEFAULT_COLOR,
          pending: f.suggestionStatus === "PENDING",
        },
      })),
  };
}

export function boundsOf(features: Feature[]): LngLatBounds2 | null {
  const boxes = features.filter(isVisible).map((f) => f.bbox);
  if (boxes.length === 0) return null;
  return [
    [Math.min(...boxes.map((b) => b.minLon)), Math.min(...boxes.map((b) => b.minLat))],
    [Math.max(...boxes.map((b) => b.maxLon)), Math.max(...boxes.map((b) => b.maxLat))],
  ];
}

const color: ExpressionSpecification = [
  "case",
  ["get", "pending"],
  SUGGESTION_COLOR,
  ["get", "color"],
];
const lines: ExpressionSpecification = [
  "in",
  ["geometry-type"],
  ["literal", ["LineString", "Polygon"]],
];

export const MISSION_LAYERS: LayerSpecification[] = [
  {
    id: "mission-fill",
    type: "fill",
    source: MISSION_SOURCE,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": color, "fill-opacity": 0.2 },
  },
  {
    id: "mission-line",
    type: "line",
    source: MISSION_SOURCE,
    filter: ["all", lines, ["!", ["get", "pending"]]],
    paint: { "line-color": color, "line-width": 3 },
  },
  {
    id: "mission-line-pending",
    type: "line",
    source: MISSION_SOURCE,
    filter: ["all", lines, ["get", "pending"]],
    paint: { "line-color": color, "line-width": 3, "line-dasharray": [2, 2] },
  },
  {
    id: "mission-point",
    type: "circle",
    source: MISSION_SOURCE,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 6,
      "circle-color": color,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  },
  {
    id: "mission-label",
    type: "symbol",
    source: MISSION_SOURCE,
    layout: {
      "text-field": ["get", "label"],
      "text-font": [MAP_FONTS[0]],
      "text-size": 12,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
    },
    paint: { "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  },
];

export const CLICKABLE_LAYERS = [
  "mission-fill",
  "mission-line",
  "mission-line-pending",
  "mission-point",
];

export function addMissionLayers(map: maplibregl.Map): void {
  map.addSource(MISSION_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  for (const layer of MISSION_LAYERS) map.addLayer(layer);
}
