import type { MissionStatus } from "./api/geomap";

export const STATUS_LABELS: Record<MissionStatus, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publiée",
  WITHDRAWN: "Retirée",
};

// The UI works in UTC (Zulu time), like the orders it supports.
export function formatUtc(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z` : "—";
}

export function toUtcInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

export function fromUtcInput(value: string): string | null {
  return value ? `${value}:00Z` : null;
}

// Archive attributions are HTML fragments such as "&copy; OpenStreetMap": keep only their text.
// A DOMParser document is inert, so nothing in the fragment runs or loads.
export function attributionText(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "";
}
