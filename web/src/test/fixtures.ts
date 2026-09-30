import type { Basemap, Feature, Mission } from "../api/geomap";

export function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Op Nord",
    status: "DRAFT",
    layers: ["zone-nord"],
    validUntil: "2026-10-02T06:00:00Z",
    createdBy: "alice",
    updatedBy: "alice",
    createdAt: "2026-09-26T08:00:00Z",
    updatedAt: "2026-09-26T09:30:00Z",
    ...overrides,
  };
}

export function feature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    missionId: "11111111-1111-4111-8111-111111111111",
    kind: "GENERIC",
    geometry: { type: "Point", coordinates: [2.35, 48.85] },
    bbox: { minLon: 2.35, minLat: 48.85, maxLon: 2.35, maxLat: 48.85 },
    name: "PC avancé",
    description: "",
    style: null,
    sidc: null,
    modifiers: null,
    origin: "HUMAN",
    suggestionStatus: null,
    createdAt: "2026-09-26T08:00:00Z",
    updatedAt: "2026-09-26T08:00:00Z",
    ...overrides,
  };
}

export function basemap(overrides: Partial<Basemap> = {}): Basemap {
  return {
    id: "zone-nord",
    name: "Zone Nord",
    kind: "VECTOR",
    attribution: "© OpenStreetMap",
    bounds: { minLon: 2, minLat: 48, maxLon: 3, maxLat: 49 },
    sizeBytes: 1000,
    sha256: "a".repeat(64),
    createdBy: "admin",
    createdAt: "2026-09-25T08:00:00Z",
    ...overrides,
  };
}
