import type { GeoJSONStoreFeatures } from "terra-draw";
import type { Feature, FeatureInput, FeatureKind, Geometry, SymbolGeometry } from "../api/geomap";
import type { PlacedSymbol } from "../symbols/SymbolPicker";
import { circleFromRing, type Position } from "./geodesy";
import { circleOf, isCircle } from "./missionLayer";

export type DrawMode = "point" | "linestring" | "polygon" | "circle";

const MODES: Record<Geometry["type"], DrawMode> = {
  Point: "point",
  LineString: "linestring",
  Polygon: "polygon",
};

const SYMBOL_MODES: Record<SymbolGeometry, DrawMode> = {
  POINT: "point",
  LINE: "linestring",
  AREA: "polygon",
};

export const modeFor = (geometry: SymbolGeometry) => SYMBOL_MODES[geometry];

export function controlPointCount(geometry: Geometry): number {
  if (geometry.type === "Point") return 1;
  if (geometry.type === "LineString") return geometry.coordinates.length;
  return geometry.coordinates[0].length - 1;
}

// Terra Draw rejects coordinates with more than 9 decimals (its default coordinatePrecision).
const round = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(round) : Math.round((value as number) * 1e9) / 1e9;

export function toFeatureInput(drawn: GeoJSONStoreFeatures, base?: Feature): FeatureInput {
  const common = {
    kind: "GENERIC" as FeatureKind,
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
  if (base?.kind === "APP6") {
    return {
      ...common,
      kind: "APP6",
      geometry: geometry as Geometry,
      style: null,
      sidc: base.sidc,
      modifiers: base.modifiers,
    };
  }
  return { ...common, geometry: geometry as Geometry, style: color ? { color } : null };
}

// Called from Terra Draw's finish handler, where a thrown error would be uncaught and unseen.
export function drawnToInput(
  drawn: GeoJSONStoreFeatures,
  base?: Feature,
  placed?: PlacedSymbol,
): { input: FeatureInput } | { error: string } {
  try {
    const input = toFeatureInput(drawn, base);
    if (!placed) return { input };
    const { minPoints, maxPoints } = placed.symbol;
    const count = controlPointCount(input.geometry);
    if (count < minPoints || count > maxPoints) {
      return {
        error: `Ce symbole demande de ${minPoints} à ${maxPoints} points (${count} tracés).`,
      };
    }
    return {
      input: {
        ...input,
        kind: "APP6",
        style: null,
        sidc: placed.sidc,
        modifiers: placed.modifiers,
      },
    };
  } catch (e) {
    return { error: `Forme invalide : ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function toDrawFeature(feature: Feature): GeoJSONStoreFeatures {
  if (feature.kind === "GENERIC" && isCircle(feature)) {
    return {
      type: "Feature",
      id: feature.id,
      geometry: {
        type: "Polygon",
        coordinates: round(circleOf(feature).coordinates) as Position[][],
      },
      properties: { mode: "circle", radiusKilometers: feature.style.radiusMeters / 1000 },
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
