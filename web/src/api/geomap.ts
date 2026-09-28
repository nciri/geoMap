import type { FeatureCollection, LineString, Point, Polygon } from "geojson";
import { api, apiResponse, uploadWithProgress } from "./client";
import { filledModifiers as filled } from "../symbols/sidc";

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

export type SymbolGeometry = "POINT" | "LINE" | "AREA";

export interface SymbolInfo {
  basicId: string;
  name: string;
  path: string;
  geometry: SymbolGeometry;
  minPoints: number;
  maxPoints: number;
  modifiers: string[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  featureId: string | null;
}

export interface ValidationReport {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface PublicationView {
  missionId: string;
  version: number;
  sha256: string;
  sizeBytes: number;
  recipients: number;
  publishedBy: string;
  publishedAt: string;
}

export type DeviceStatus = "ENROLLED" | "REVOKED";

export interface Device {
  id: string;
  name: string;
  certSha256: string;
  status: DeviceStatus;
  lastContact: string | null;
  createdAt: string;
}

export interface DeviceRegistration {
  name: string;
  certSha256: string;
  encryptionPublicKeyPem: string;
}

export interface SymbolIconImage {
  blob: Blob;
  anchorX: number;
  anchorY: number;
}

export type GraphicCollection = FeatureCollection;

export const searchSymbols = (q: string, limit = 50) =>
  api<SymbolInfo[]>(`/api/symbols?q=${encodeURIComponent(q)}&limit=${limit}`);
export const describeSymbol = (sidc: string) => api<SymbolInfo>(`/api/symbols/${sidc}`);

export async function fetchSymbolIcon(
  sidc: string,
  modifiers: Record<string, string>,
  size = 64,
): Promise<SymbolIconImage> {
  const params = new URLSearchParams({ size: String(size), ...filled(modifiers) });
  const response = await apiResponse(`/api/symbols/${sidc}/icon.png?${params}`);
  return {
    blob: await response.blob(),
    anchorX: Number(response.headers.get("X-Anchor-X") ?? 0),
    anchorY: Number(response.headers.get("X-Anchor-Y") ?? 0),
  };
}

export const renderGraphic = (
  sidc: string,
  geometry: Geometry,
  modifiers: Record<string, string>,
  zoom: number,
) =>
  api<GraphicCollection>(`/api/symbols/${sidc}/graphic`, {
    method: "POST",
    json: { geometry, modifiers: filled(modifiers), zoom },
  });

export const getValidation = (missionId: string) =>
  api<ValidationReport>(`${missionPath(missionId)}/validation`);
export const publishMission = (missionId: string) =>
  api<PublicationView>(`${missionPath(missionId)}/publish`, { method: "POST" });
export const listVersions = (missionId: string) =>
  api<PublicationView[]>(`${missionPath(missionId)}/versions`);
export const withdrawMission = (missionId: string) =>
  api<Mission>(`${missionPath(missionId)}/withdraw`, { method: "POST" });

export async function downloadPackage(
  missionId: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiResponse(`${missionPath(missionId)}/package`);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `${missionId}.gmp`;
  return { blob: await response.blob(), filename };
}

export const listDevices = () => api<Device[]>("/api/devices");
export const registerDevice = (registration: DeviceRegistration) =>
  api<Device>("/api/devices", { method: "POST", json: registration });
export const revokeDevice = (id: string) =>
  api<Device>(`/api/devices/${id}/revoke`, { method: "POST" });
export const listAssignedDevices = (missionId: string) =>
  api<Device[]>(`${missionPath(missionId)}/devices`);
export const assignDevices = (missionId: string, deviceIds: string[]) =>
  api<Device[]>(`${missionPath(missionId)}/devices`, { method: "PUT", json: { deviceIds } });

export const uploadBasemap = (
  id: string,
  name: string,
  file: Blob,
  onProgress: (fraction: number) => void,
) =>
  uploadWithProgress<Basemap>(
    `/api/basemaps/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}`,
    file,
    onProgress,
  );
