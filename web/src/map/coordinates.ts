import { forward } from "mgrs";

export function formatLatLon(lng: number, lat: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}° ${ns} ${Math.abs(lng).toFixed(5)}° ${ew}`;
}

export function formatMgrs(lng: number, lat: number): string {
  try {
    return forward([lng, lat], 5).replace(
      /^(\d{1,2}[C-X])([A-Z]{2})(\d{5})(\d{5})$/,
      "$1 $2 $3 $4",
    );
  } catch {
    // MGRS stops at 84° N and 80° S (polar UPS areas).
    return "hors zone MGRS";
  }
}
