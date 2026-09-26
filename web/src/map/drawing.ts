import type { GeoJSONStoreFeatures } from "terra-draw";
import type { Feature, FeatureInput, Geometry } from "../api/geomap";
import { circleFromRing, circlePolygon, type Position } from "./geodesy";

export type DrawMode = "point" | "linestring" | "polygon" | "circle";

const MODES: Record<Geometry["type"], DrawMode> = {
  Point: "point",
  LineString: "linestring",
  Polygon: "polygon",
};

// Terra Draw rejects coordinates with more than 9 decimals (its default coordinatePrecision).
const round = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(round) : Math.round((value as number) * 1e9) / 1e9;

export function toFeatureInput(drawn: GeoJSONStoreFeatures, base?: Feature): FeatureInput {
  const common = {
    kind: "GENERIC" as const,
    name: base?.name ?? "",
    description: base?.description ?? "",
  };
  const color = base?.style?.color;
  if (drawn.properties.mode === "circle" && drawn.geometry.type === "Polygon") {
    const { center, radiusMeters } = circleFromRing(drawn.geometry.coordinates[0] as Position[]);
    return {
      ...common,
      geometry: { type: "Point", coordinates: center },
      style: { ...(color ? { color } : {}), radiusMeters: Math.round(radiusMeters * 10) / 10 },
    };
  }
  const geometry = drawn.geometry;
  if (!(geometry.type in MODES)) throw new Error(`unsupported drawn geometry: ${geometry.type}`);
  return { ...common, geometry: geometry as Geometry, style: color ? { color } : null };
}

export function toDrawFeature(feature: Feature): GeoJSONStoreFeatures | null {
  if (feature.kind !== "GENERIC") return null;
  const radius = feature.style?.radiusMeters;
  if (feature.geometry.type === "Point" && radius) {
    const circle = circlePolygon(feature.geometry.coordinates.slice(0, 2) as Position, radius);
    return {
      type: "Feature",
      id: feature.id,
      geometry: { type: "Polygon", coordinates: round(circle.coordinates) as Position[][] },
      properties: { mode: "circle", radiusKilometers: radius / 1000 },
    };
  }
  return {
    type: "Feature",
    id: feature.id,
    geometry: {
      ...feature.geometry,
      coordinates: round(feature.geometry.coordinates),
    } as GeoJSONStoreFeatures["geometry"],
    properties: { mode: MODES[feature.geometry.type] },
  };
}
