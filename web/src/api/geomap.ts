import type { LineString, Point, Polygon } from "geojson";
import { api } from "./client";

export type Geometry = Point | LineString | Polygon;
export type MissionStatus = "DRAFT" | "PUBLISHED" | "WITHDRAWN";
export type FeatureKind = "GENERIC" | "APP6";
export type FeatureOrigin = "HUMAN" | "AI_SUGGESTED";
export type SuggestionStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export interface Mission {
  id: string;
  name: string;
  status: MissionStatus;
  basemapId: string | null;
  validUntil: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MissionInput {
  name: string;
  basemapId?: string | null;
  validUntil?: string | null;
}

export type MissionPatch = Partial<MissionInput>;

export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface FeatureStyle {
  color?: string;
  radiusMeters?: number;
}

export interface Feature {
  id: string;
  missionId: string;
  kind: FeatureKind;
  geometry: Geometry;
  bbox: BBox;
  name: string;
  description: string;
  style: FeatureStyle | null;
  sidc: string | null;
  modifiers: Record<string, string> | null;
  origin: FeatureOrigin;
  suggestionStatus: SuggestionStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureInput {
  kind: FeatureKind;
  geometry: Geometry;
  name?: string;
  description?: string;
  style?: FeatureStyle | null;
  sidc?: string | null;
  modifiers?: Record<string, string> | null;
}

export interface Basemap {
  id: string;
  name: string;
  sizeBytes: number;
  sha256: string;
  createdBy: string;
  createdAt: string;
}

const missionPath = (id: string) => `/api/missions/${id}`;
const featuresPath = (missionId: string) => `${missionPath(missionId)}/features`;

export const listMissions = () => api<Mission[]>("/api/missions");
export const getMission = (id: string) => api<Mission>(missionPath(id));
export const createMission = (input: MissionInput) =>
  api<Mission>("/api/missions", { method: "POST", json: input });
export const updateMission = (id: string, patch: MissionPatch) =>
  api<Mission>(missionPath(id), { method: "PATCH", json: patch });
export const deleteMission = (id: string) => api<void>(missionPath(id), { method: "DELETE" });

export const listFeatures = (missionId: string) => api<Feature[]>(featuresPath(missionId));
export const createFeature = (missionId: string, input: FeatureInput) =>
  api<Feature>(featuresPath(missionId), { method: "POST", json: input });
export const updateFeature = (missionId: string, featureId: string, input: FeatureInput) =>
  api<Feature>(`${featuresPath(missionId)}/${featureId}`, { method: "PUT", json: input });
export const deleteFeature = (missionId: string, featureId: string) =>
  api<void>(`${featuresPath(missionId)}/${featureId}`, { method: "DELETE" });
export const acceptFeature = (missionId: string, featureId: string) =>
  api<Feature>(`${featuresPath(missionId)}/${featureId}/accept`, { method: "POST" });
export const rejectFeature = (missionId: string, featureId: string) =>
  api<Feature>(`${featuresPath(missionId)}/${featureId}/reject`, { method: "POST" });

export const listBasemaps = () => api<Basemap[]>("/api/basemaps");
export const basemapTilesUrl = (id: string) => `/api/basemaps/${encodeURIComponent(id)}/pmtiles`;
