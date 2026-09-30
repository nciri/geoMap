import { IMAGERY_PREFIX } from "./style";

export type MapMode = "Carte" | "Satellite" | "Hybride";

const KEY = "geomap.mapMode";
const MODES: MapMode[] = ["Carte", "Satellite", "Hybride"];

export function visibility(layerId: string, overlay: boolean, mode: MapMode): "visible" | "none" {
  if (layerId.startsWith(IMAGERY_PREFIX)) return mode === "Carte" ? "none" : "visible";
  if (overlay) return mode === "Satellite" ? "none" : "visible";
  return "visible";
}

export const effectiveMode = (mode: MapMode, hasImagery: boolean): MapMode =>
  hasImagery ? mode : "Carte";

// A per-browser convenience: storage may be blocked (private window), never an error.
export function loadMode(): MapMode {
  try {
    const stored = localStorage.getItem(KEY);
    return MODES.includes(stored as MapMode) ? (stored as MapMode) : "Carte";
  } catch {
    return "Carte";
  }
}

export function saveMode(mode: MapMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Not remembered, nothing else to do.
  }
}
