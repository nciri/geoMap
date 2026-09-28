# Web APP-6D, Publication and Administration Implementation Plan (plan web-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the planner's web app: pick, place, edit and display APP-6D symbols (icons and tactical graphics rendered by the server), check a mission with the validator, publish it, keep its version history, assign it to devices, export it for SD cards, withdraw it; give administrators their device and basemap screens; prove the whole journey with Playwright against a real Keycloak, PostgreSQL, MinIO and server.

**Architecture:** Same Vite + React app as web-1. The API client gains a `Response`-level helper (downloads, icon headers) and an `XMLHttpRequest` upload with progress. APP-6D logic is split into pure modules (`symbols/sidc.ts`, `map/symbolLayer.ts`) that are unit-tested, and thin React/MapLibre wiring that the Playwright journey covers. Point symbols are PNG icons fetched with the bearer token and registered as MapLibre images; line and area symbols are rendered by `POST /api/symbols/{sidc}/graphic` for the current zoom band and drawn as a separate GeoJSON source. APP-6D objects are placed and reshaped through the existing Terra Draw flow, keeping their SIDC and modifiers. The e2e stack runs PostgreSQL, MinIO and Keycloak in Docker Compose with secrets generated per machine, and starts the server with `bootRun` and the web app with `vite`.

**Tech Stack:** React 19.3.0, react-router 8.4.0, @tanstack/react-query 5.104.0, maplibre-gl 6.11.2, terra-draw 1.35.0, Vitest 5.0.2 + msw 2.15.0, @playwright/test 1.63.0, Keycloak (latest 26.x image, pinned in Task 9), Docker Compose. Server: Kotlin 2.2.20, Spring Boot 4.1.0, mil-sym-java 2.9.6.

**Spec:** `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` (sections 5, 7.3, 8.1, 9, 12)

**Plan series:** web-1 done (branch `feature/web`) → **web-2 (this plan, same branch)** → 2d (enrollment, mTLS sync, PKI) → android → helm.

## Global Constraints

- Everything from plan web-1 still applies (air gap, runtime `/config.json`, relative `/api` paths, token never logged nor in `localStorage`, UI in French / code in English, UTC display, exact version pins, `make check` gate). **No AI attribution in commit messages — no `Co-Authored-By` or "Generated with" line of any kind.**
- Full APP-6D SIDC (20 digits) = `"10"` (version) + `"0"` (context: reality) + identity (1 digit) + symbol set (basicId chars 1-2) + `"0"` (status: present) + `"0"` (HQ/TF/dummy) + echelon (2 digits, `"00"` = none) + entity (basicId chars 3-8) + `"0000"` (modifiers 1 and 2). Verified: infantry friend battalion = `10031000161211000000`, hostile = `10061000161211000000`.
- Identity codes: `3` Ami, `6` Hostile, `4` Neutre, `1` Inconnu, `2` Ami présumé, `5` Suspect. Echelon is offered only for land units (basicId starting with `10`).
- Modifier keys are mil-sym letter codes (`SymbolInfo.modifiers`). Labelled in French: `T` Désignation, `H` Informations complémentaires, `W` Date-heure; every other key is shown as `Champ <lettre>`. Empty values are never sent.
- `GET /api/symbols/{sidc}/icon.png` headers `X-Anchor-X`/`X-Anchor-Y` are the pixel position of the symbol's centre from the image's top-left; the icon is drawn so that this point sits on the object's coordinates.
- Tactical graphics come back as `MultiLineString` outlines (properties `strokeColor`, `strokeWidth`) and `Point` labels (properties `label`, `fontColor`, `labelAlign` left/right/center, `rotation` degrees, `anchorOffsetX/Y` pixels, `labelOutlineColor`, `labelOutlineWidth`). Zoom bands: 0–10 LOW, 11–14 MID, 15–22 HIGH (server `RenderBand.forZoom`).
- Validator codes shown in French: `NO_BASEMAP` Aucun fond de carte, `UNKNOWN_BASEMAP` Fond de carte inconnu, `NO_EXPIRY` Aucune date de validité, `EXPIRED` Date de validité dépassée, `NO_RECIPIENT` Aucun terminal enrôlé affecté, `SYMBOL_NOT_RENDERABLE` Symbole impossible à afficher, `PENDING_SUGGESTIONS` Suggestions IA en attente, `EMPTY_MISSION` Mission vide; unknown codes show the server message.
- Only humans publish, withdraw, export and assign (the server enforces it). Planners (`planificateur`) may list devices to assign them; only administrators register or revoke them.
- Device registration stays manual (name, certificate SHA-256, RSA public key PEM) until plan 2d replaces it with QR-code enrollment.
- The e2e secrets (Keycloak admin, test users, PostgreSQL, MinIO, server signing key) are generated per machine into a gitignored file; nothing secret is committed.

## Review Focus

- A point symbol must sit on its coordinates: the icon's anchor, not the image centre, marks the position. (Task 5 `iconOffset` test.)
- A tactical graphic must follow the zoom: a line drawn at zoom 16 re-renders when the view zooms out to 9 (another band). (Task 5: `bandOf` test, and the band is part of each graphic's query key.)
- Reshaping or re-labelling an APP-6D object must never turn it into a generic object nor drop its SIDC or modifiers. (Task 4 tests.)
- Publishing, exporting or assigning must show the server's refusal (e.g. `mission is not publishable: NO_RECIPIENT`) next to the French validator explanation, never fail silently. (Tasks 6, 7 tests.)
- An administrator without the planner role must land on a usable page, not on a refusal. (Task 8 test.)

## File Structure

| File | Responsibility |
|---|---|
| `server/.../symbology/SymbolController.kt` | `GET /api/symbols/{sidc}` |
| `server/.../device/DeviceController.kt` | planners may list devices |
| `web/src/api/client.ts`, `web/src/api/geomap.ts` | `apiResponse`, `uploadWithProgress`, new endpoints and types |
| `web/src/symbols/{sidc.ts,SymbolFields.tsx,SymbolIcon.tsx,SymbolPicker.tsx}` | SIDC, modifier form, icon preview, picker |
| `web/src/map/{drawing.ts,symbolLayer.ts,useSymbolRendering.ts,missionLayer.ts}` | APP-6D placement/reshape converters, icon and graphic layers |
| `web/src/editor/{MissionEditorPage,FeaturePanel,PublicationPanel,AssignmentPanel}.tsx` | editor wiring, validator, publication, assignment |
| `web/src/files.ts` | save a downloaded file |
| `web/src/admin/{DevicesPage,BasemapsPage}.tsx`, `web/src/{App,Layout,Home}.tsx` | administration and role-based navigation |
| `web/e2e/**`, `web/playwright.config.ts`, `Makefile` | Playwright journey and its stack |

---

### Task 1: Server — describe a symbol, let planners list devices

**Files:**
- Modify: `server/src/main/kotlin/geomap/server/symbology/SymbolController.kt`
- Modify: `server/src/main/kotlin/geomap/server/device/DeviceController.kt`
- Modify: `server/src/test/kotlin/geomap/server/device/DeviceApiTest.kt` (the test asserting that planners cannot list devices)
- Test: `server/src/test/kotlin/geomap/server/symbology/SymbolApiTest.kt`

**Interfaces:**
- Produces: `GET /api/symbols/{sidc}` → `SymbolInfo` (role `planificateur`), 404 `unknown APP-6D symbol: <sidc>` when `SymbolCatalog.describe` returns null. `GET /api/devices` allowed to `planificateur` and `administrateur`; `POST /api/devices` and `POST /api/devices/{id}/revoke` stay administrator-only.

- [ ] **Step 1: Write the failing tests**

Add to `SymbolApiTest.kt` (inside the class):

```kotlin
    @Test
    fun `describes a symbol from its full SIDC`() {
        mvc.get("/api/symbols/10031000161211000000") { with(planner()) }.andExpect {
            status { isOk() }
            jsonPath("$.basicId") { value("10121100") }
            jsonPath("$.name") { value("Infantry") }
            jsonPath("$.geometry") { value("POINT") }
        }
    }

    @Test
    fun `an unknown SIDC is not found`() {
        mvc.get("/api/symbols/10039999999999990000") { with(planner()) }.andExpect { status { isNotFound() } }
    }
```

In `DeviceApiTest.kt`, replace the test `only an administrator manages devices` with:

```kotlin
    @Test
    fun `only an administrator registers or revokes, planners may list`() {
        register(who = planner()).andExpect { status { isForbidden() } }
        mvc.get("/api/devices") { with(planner()) }.andExpect { status { isOk() } }
        mvc.post("/api/devices/${java.util.UUID.randomUUID()}/revoke") { with(planner()) }.andExpect {
            status { isForbidden() }
        }
    }
```

(Keep the file's existing imports; add `org.springframework.test.web.servlet.post` if it is not imported yet.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && ./gradlew test --tests 'geomap.server.symbology.SymbolApiTest' --tests 'geomap.server.device.DeviceApiTest'`
Expected: FAIL — the describe route answers 4xx/5xx instead of 200, and the planner list answers 403.

- [ ] **Step 3: Write minimal implementation**

In `SymbolController.kt`, add (import `geomap.server.web.NotFoundException`):

```kotlin
    @GetMapping("/{sidc}")
    fun describe(
        @PathVariable sidc: String,
    ): SymbolInfo = catalog.describe(sidc) ?: throw NotFoundException("unknown APP-6D symbol: $sidc")
```

In `DeviceController.kt`, change the list route's annotation:

```kotlin
    @GetMapping("/api/devices")
    // Planners need the device list to assign missions; registering and revoking stay with administrators.
    @PreAuthorize("hasAnyRole('planificateur', 'administrateur')")
    fun list(): List<DeviceView> = service.list().map { it.view() }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && ./gradlew test --tests 'geomap.server.symbology.*' --tests 'geomap.server.device.*'`
Expected: PASS.

- [ ] **Step 5: Run the server gate and commit**

Run: `cd server && ./gradlew check`
Expected: BUILD SUCCESSFUL.

```bash
git add server
git commit -m "feat(server): describe a symbol by SIDC and let planners list devices"
```

---

### Task 2: API client for symbols, validation, publication, devices and uploads

**Files:**
- Modify: `web/src/api/client.ts`, `web/src/api/geomap.ts`, `web/src/test/setup.ts`
- Test: `web/src/api/client.test.ts`, `web/src/api/geomap.test.ts`

**Interfaces:**
- Consumes: `getAccessToken`, `notifyUnauthorized` (web-1).
- Produces:
  - `client.ts`: `apiResponse(path, init?): Promise<Response>` (same auth/error rules as `api`, returns the raw OK response), `uploadWithProgress<T>(path: string, body: Blob, onProgress: (fraction: number) => void): Promise<T>` (XHR `PUT`, `application/octet-stream`, bearer token, ProblemDetail errors, 401 → `notifyUnauthorized`). `api` is rebuilt on `apiResponse`.
  - `geomap.ts` types: `SymbolGeometry`, `SymbolInfo`, `ValidationIssue`, `ValidationReport`, `PublicationView`, `DeviceStatus`, `Device`, `DeviceRegistration`, `SymbolIconImage { blob: Blob; anchorX: number; anchorY: number }`, `GraphicCollection` (GeoJSON `FeatureCollection`).
  - `geomap.ts` functions: `searchSymbols(q, limit?)`, `describeSymbol(sidc)`, `fetchSymbolIcon(sidc, modifiers, size?)`, `renderGraphic(sidc, geometry, modifiers, zoom)`, `getValidation(missionId)`, `publishMission(missionId)`, `listVersions(missionId)`, `downloadPackage(missionId): Promise<{ blob: Blob; filename: string }>`, `withdrawMission(missionId)`, `listDevices()`, `registerDevice(registration)`, `revokeDevice(id)`, `listAssignedDevices(missionId)`, `assignDevices(missionId, deviceIds)`, `uploadBasemap(id, name, file, onProgress)`.
  - `test/setup.ts`: jsdom stubs for `URL.createObjectURL`/`URL.revokeObjectURL` when missing.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/api/client.test.ts` (merge the new names into the file's existing `./client` import):

```ts
import { apiResponse, uploadWithProgress } from "./client";

it("returns the raw response for downloads, with its headers", async () => {
  server.use(
    http.get("/api/file", () =>
      HttpResponse.arrayBuffer(new Uint8Array([71, 77, 80, 49]).buffer, {
        headers: { "Content-Disposition": 'attachment; filename="m-v1.gmp"' },
      }),
    ),
  );
  const response = await apiResponse("/api/file");
  expect(response.headers.get("Content-Disposition")).toContain("m-v1.gmp");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([71, 77, 80, 49]));
});

it("uploads a file with the bearer token and returns the JSON answer", async () => {
  let seen: unknown;
  server.use(
    http.put("/api/basemaps/zone-nord", async ({ request }) => {
      seen = {
        auth: request.headers.get("Authorization"),
        type: request.headers.get("Content-Type"),
        size: (await request.arrayBuffer()).byteLength,
      };
      return HttpResponse.json({ id: "zone-nord" }, { status: 201 });
    }),
  );
  setAccessToken("token-3");
  const result = await uploadWithProgress<{ id: string }>(
    "/api/basemaps/zone-nord",
    new Blob([new Uint8Array(10)]),
    () => {},
  );
  expect(result).toEqual({ id: "zone-nord" });
  expect(seen).toEqual({ auth: "Bearer token-3", type: "application/octet-stream", size: 10 });
});

it("turns an upload refusal into an ApiError carrying its detail", async () => {
  server.use(
    http.put("/api/basemaps/zone-nord", () =>
      HttpResponse.json({ status: 409, detail: "basemap zone-nord already exists" }, { status: 409 }),
    ),
  );
  await expect(
    uploadWithProgress("/api/basemaps/zone-nord", new Blob([new Uint8Array(1)]), () => {}),
  ).rejects.toMatchObject({ status: 409, message: "basemap zone-nord already exists" });
});
```

`web/src/api/geomap.test.ts`:

```ts
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { downloadPackage, fetchSymbolIcon, renderGraphic, searchSymbols } from "./geomap";

it("searches symbols with an encoded query", async () => {
  let url = "";
  server.use(
    http.get("/api/symbols", ({ request }) => {
      url = request.url;
      return HttpResponse.json([]);
    }),
  );
  await searchSymbols("ligne avant", 50);
  expect(new URL(url).searchParams.get("q")).toBe("ligne avant");
  expect(new URL(url).searchParams.get("limit")).toBe("50");
});

it("fetches an icon with its anchor and skips empty modifiers", async () => {
  let url = "";
  server.use(
    http.get("/api/symbols/:sidc/icon.png", ({ request }) => {
      url = request.url;
      return HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
        headers: { "Content-Type": "image/png", "X-Anchor-X": "40", "X-Anchor-Y": "33" },
      });
    }),
  );
  const icon = await fetchSymbolIcon("10031000161211000000", { T: "1ER RI", H: "" });
  expect(icon.anchorX).toBe(40);
  expect(icon.anchorY).toBe(33);
  expect(icon.blob.size).toBe(3);
  const params = new URL(url).searchParams;
  expect(params.get("size")).toBe("64");
  expect(params.get("T")).toBe("1ER RI");
  expect(params.has("H")).toBe(false);
});

it("asks the server to render a graphic for a zoom", async () => {
  let body: unknown;
  server.use(
    http.post("/api/symbols/:sidc/graphic", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ type: "FeatureCollection", features: [] });
    }),
  );
  const geometry = {
    type: "LineString" as const,
    coordinates: [
      [2, 48],
      [3, 48.1],
    ],
  };
  await renderGraphic("10032500001401000000", geometry, { N: "ENY", T: "" }, 12);
  expect(body).toEqual({ geometry, modifiers: { N: "ENY" }, zoom: 12 });
});

it("downloads a package under the server's file name", async () => {
  server.use(
    http.get("/api/missions/m1/package", () =>
      HttpResponse.arrayBuffer(new Uint8Array([71, 77, 80, 49]).buffer, {
        headers: { "Content-Disposition": 'attachment; filename="m1-v2.gmp"' },
      }),
    ),
  );
  const file = await downloadPackage("m1");
  expect(file.filename).toBe("m1-v2.gmp");
  expect(file.blob.size).toBe(4);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/api`
Expected: FAIL — `apiResponse`/`uploadWithProgress`/`searchSymbols`… are not exported.

- [ ] **Step 3: Write minimal implementation**

Replace `web/src/api/client.ts` with:

```ts
import { getAccessToken, notifyUnauthorized } from "../auth/session";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiInit = Omit<RequestInit, "body"> & { json?: unknown };

export async function apiResponse(
  path: string,
  { json, headers, ...init }: ApiInit = {},
): Promise<Response> {
  const request = new Headers(headers);
  const token = getAccessToken();
  if (token) request.set("Authorization", `Bearer ${token}`);
  if (json !== undefined) request.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers: request,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  if (response.status === 401) notifyUnauthorized();
  if (!response.ok) {
    throw new ApiError(response.status, problemDetail(await response.text(), response.status));
  }
  return response;
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const response = await apiResponse(path, init);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// fetch cannot report upload progress; basemaps weigh hundreds of MB.
export function uploadWithProgress<T>(
  path: string,
  body: Blob,
  onProgress: (fraction: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", path);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 401) notifyUnauthorized();
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText) as T);
      else reject(new ApiError(xhr.status, problemDetail(xhr.responseText, xhr.status)));
    };
    xhr.onerror = () => reject(new ApiError(0, "Connexion au serveur impossible."));
    xhr.send(body);
  });
}

function problemDetail(text: string, status: number): string {
  try {
    const body = JSON.parse(text) as { detail?: unknown; title?: unknown };
    if (typeof body.detail === "string" && body.detail) return body.detail;
    if (typeof body.title === "string" && body.title) return body.title;
  } catch {
    // Not a ProblemDetail (proxy error page, empty body): the status line is all we have.
  }
  return `HTTP ${status}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

Append to `web/src/api/geomap.ts` (add `apiResponse` and `uploadWithProgress` to the import from `./client`, and `FeatureCollection` to the `geojson` type import):

```ts
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

const filled = (modifiers: Record<string, string>) =>
  Object.fromEntries(Object.entries(modifiers).filter(([, value]) => value.trim() !== ""));

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

export async function downloadPackage(missionId: string): Promise<{ blob: Blob; filename: string }> {
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
```

Append to `web/src/test/setup.ts`:

```ts
// jsdom has no object URLs; components only need a stable string to put in <img src>.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS — the new client and geomap tests and every earlier test (the original client tests still pass on the rebuilt `api`).

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): API client for symbols, publication, devices and uploads"
```

---

### Task 3: SIDC builder and APP-6D symbol picker

**Files:**
- Create: `web/src/symbols/sidc.ts`, `web/src/symbols/SymbolFields.tsx`, `web/src/symbols/SymbolIcon.tsx`, `web/src/symbols/SymbolPicker.tsx`
- Test: `web/src/symbols/sidc.test.ts`, `web/src/symbols/SymbolPicker.test.tsx`

**Interfaces:**
- Consumes: `searchSymbols`, `fetchSymbolIcon`, `SymbolInfo`, `SymbolGeometry` (Task 2).
- Produces:
  - `sidc.ts`: `IDENTITIES`, `ECHELONS` (`{ code: string; label: string }[]`), `buildSidc(basicId: string, identity: string, echelon?: string): string`, `parseSidc(sidc: string): { basicId: string; identity: string; echelon: string }`, `hasEchelon(basicId: string): boolean`, `modifierLabel(key: string): string`, `KNOWN_MODIFIERS = ["T", "H", "W"]`, `GEOMETRY_LABELS: Record<SymbolGeometry, string>`, `groupByCategory(symbols: SymbolInfo[]): [string, SymbolInfo[]][]`, `filledModifiers(modifiers: Record<string, string>): Record<string, string>`.
  - `SymbolFields({ symbol, identity, echelon, modifiers, onChange })` and type `SymbolChoice = { identity: string; echelon: string; modifiers: Record<string, string> }`.
  - `SymbolIcon({ sidc, modifiers, alt })` — `<img>` of the server icon fetched with the token; an alert on error.
  - `SymbolPicker({ onPlace })` and type `PlacedSymbol = { symbol: SymbolInfo; sidc: string; modifiers: Record<string, string> }`; `onPlace` fires on "Placer sur la carte".

- [ ] **Step 1: Write the failing tests**

`web/src/symbols/sidc.test.ts`:

```ts
import type { SymbolInfo } from "../api/geomap";
import {
  buildSidc,
  filledModifiers,
  groupByCategory,
  hasEchelon,
  modifierLabel,
  parseSidc,
} from "./sidc";

it("builds the verified infantry SIDCs", () => {
  expect(buildSidc("10121100", "3", "16")).toBe("10031000161211000000");
  expect(buildSidc("10121100", "6", "16")).toBe("10061000161211000000");
  expect(buildSidc("25140100", "3")).toBe("10032500001401000000");
});

it("reads identity, echelon and basic id back from a SIDC", () => {
  expect(parseSidc("10061000161211000000")).toEqual({
    basicId: "10121100",
    identity: "6",
    echelon: "16",
  });
});

it("offers an echelon for land units only", () => {
  expect(hasEchelon("10121100")).toBe(true);
  expect(hasEchelon("25140100")).toBe(false);
});

it("labels known modifiers in French and the others by letter", () => {
  expect(modifierLabel("T")).toBe("Désignation");
  expect(modifierLabel("AS")).toBe("Champ AS");
});

it("drops empty modifier values", () => {
  expect(filledModifiers({ T: "1ER RI", H: " ", W: "" })).toEqual({ T: "1ER RI" });
});

it("groups search results by top-level category, trimming names", () => {
  const symbol = (basicId: string, name: string, path: string): SymbolInfo => ({
    basicId,
    name,
    path,
    geometry: "POINT",
    minPoints: 1,
    maxPoints: 1,
    modifiers: [],
  });
  const groups = groupByCategory([
    symbol("10121100", "Infantry", "Land Unit / Movement and Maneuver"),
    symbol("27110101", "Infantry", "Dismounted Individuals / Military / Service Branch"),
    symbol("10121104", "Motorized ", "Land Unit / Movement and Maneuver / Infantry"),
  ]);
  expect(groups.map(([category, items]) => [category, items.map((s) => s.name)])).toEqual([
    ["Land Unit", ["Infantry", "Motorized"]],
    ["Dismounted Individuals", ["Infantry"]],
  ]);
});
```

`web/src/symbols/SymbolPicker.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import type { SymbolInfo } from "../api/geomap";
import { SymbolPicker } from "./SymbolPicker";

const infantry: SymbolInfo = {
  basicId: "10121100",
  name: "Infantry",
  path: "Land Unit / Movement and Maneuver",
  geometry: "POINT",
  minPoints: 1,
  maxPoints: 1,
  modifiers: ["T", "H", "AS"],
};
const flot: SymbolInfo = {
  basicId: "25140100",
  name: "Forward Line of Own Troops",
  path: "Control Measure / Command and Control Lines",
  geometry: "LINE",
  minPoints: 2,
  maxPoints: 50,
  modifiers: ["N"],
};

function serve() {
  const iconRequests: string[] = [];
  server.use(
    http.get("/api/symbols", ({ request }) => {
      const q = new URL(request.url).searchParams.get("q");
      return HttpResponse.json(q === "infantry" ? [infantry] : [flot]);
    }),
    http.get("/api/symbols/:sidc/icon.png", ({ params }) => {
      iconRequests.push(String(params.sidc));
      return HttpResponse.arrayBuffer(new Uint8Array([1]).buffer, {
        headers: { "X-Anchor-X": "10", "X-Anchor-Y": "10" },
      });
    }),
  );
  return iconRequests;
}

it("finds a unit, builds its SIDC from identity and echelon, and places it", async () => {
  const iconRequests = serve();
  const onPlace = vi.fn();
  renderWithProviders(<SymbolPicker onPlace={onPlace} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Rechercher un symbole"), "infantry");
  await user.click(await screen.findByRole("button", { name: /Infantry/ }));
  expect(screen.getByRole("heading", { name: "Land Unit" })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Identité"), "6");
  await user.selectOptions(screen.getByLabelText("Échelon"), "16");
  await user.type(screen.getByLabelText("Désignation"), "1ER RI");
  await waitFor(() => expect(iconRequests).toContain("10061000161211000000"));
  await user.click(screen.getByRole("button", { name: "Placer sur la carte" }));
  expect(onPlace).toHaveBeenCalledWith({
    symbol: infantry,
    sidc: "10061000161211000000",
    modifiers: { T: "1ER RI" },
  });
});

it("offers no echelon for a control measure and shows other fields by letter", async () => {
  serve();
  renderWithProviders(<SymbolPicker onPlace={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Rechercher un symbole"), "ligne");
  await user.click(await screen.findByRole("button", { name: /Forward Line of Own Troops/ }));
  expect(screen.queryByLabelText("Échelon")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Champ N")).toBeInTheDocument();
  expect(screen.getByText(/Ligne · 2 à 50 points/)).toBeInTheDocument();
});

it("shows the server's reason when the search fails", async () => {
  server.use(
    http.get("/api/symbols", () =>
      HttpResponse.json(
        { status: 400, detail: "limit must be between 1 and 100" },
        { status: 400 },
      ),
    ),
  );
  renderWithProviders(<SymbolPicker onPlace={vi.fn()} />);
  await userEvent.type(screen.getByLabelText("Rechercher un symbole"), "xx");
  expect(await screen.findByRole("alert")).toHaveTextContent("limit must be between 1 and 100");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/symbols`
Expected: FAIL — `Failed to resolve import "./sidc"` / `"./SymbolPicker"`.

- [ ] **Step 3: Write minimal implementation**

`web/src/symbols/sidc.ts`:

```ts
import type { SymbolGeometry, SymbolInfo } from "../api/geomap";

export const IDENTITIES = [
  { code: "3", label: "Ami" },
  { code: "6", label: "Hostile" },
  { code: "4", label: "Neutre" },
  { code: "1", label: "Inconnu" },
  { code: "2", label: "Ami présumé" },
  { code: "5", label: "Suspect" },
];

export const ECHELONS = [
  { code: "00", label: "—" },
  { code: "11", label: "Équipe" },
  { code: "12", label: "Groupe" },
  { code: "13", label: "Demi-section" },
  { code: "14", label: "Section" },
  { code: "15", label: "Compagnie" },
  { code: "16", label: "Bataillon" },
  { code: "17", label: "Régiment" },
  { code: "18", label: "Brigade" },
  { code: "21", label: "Division" },
  { code: "22", label: "Corps d'armée" },
  { code: "23", label: "Armée" },
];

export const KNOWN_MODIFIERS = ["T", "H", "W"];

const MODIFIER_LABELS: Record<string, string> = {
  T: "Désignation",
  H: "Informations complémentaires",
  W: "Date-heure",
};

export const GEOMETRY_LABELS: Record<SymbolGeometry, string> = {
  POINT: "Point",
  LINE: "Ligne",
  AREA: "Zone",
};

// 20 digits: version 10, context 0 (reality), identity, symbol set, status 0, HQ/TF/dummy 0,
// echelon, entity, modifiers 1 and 2.
export function buildSidc(basicId: string, identity: string, echelon = "00"): string {
  return `100${identity}${basicId.slice(0, 2)}00${echelon}${basicId.slice(2)}0000`;
}

export function parseSidc(sidc: string): { basicId: string; identity: string; echelon: string } {
  return {
    basicId: sidc.slice(4, 6) + sidc.slice(10, 16),
    identity: sidc.charAt(3),
    echelon: sidc.slice(8, 10),
  };
}

export const hasEchelon = (basicId: string) => basicId.startsWith("10");

export const modifierLabel = (key: string) => MODIFIER_LABELS[key] ?? `Champ ${key}`;

export const filledModifiers = (modifiers: Record<string, string>) =>
  Object.fromEntries(Object.entries(modifiers).filter(([, value]) => value.trim() !== ""));

export function groupByCategory(symbols: SymbolInfo[]): [string, SymbolInfo[]][] {
  const groups = new Map<string, SymbolInfo[]>();
  for (const symbol of symbols) {
    const category = symbol.path.split(" / ")[0];
    // mil-sym names sometimes carry a trailing space.
    groups.set(category, [...(groups.get(category) ?? []), { ...symbol, name: symbol.name.trim() }]);
  }
  return [...groups];
}
```

`web/src/symbols/SymbolFields.tsx`:

```tsx
import type { SymbolInfo } from "../api/geomap";
import { ECHELONS, hasEchelon, IDENTITIES, KNOWN_MODIFIERS, modifierLabel } from "./sidc";

export interface SymbolChoice {
  identity: string;
  echelon: string;
  modifiers: Record<string, string>;
}

interface Props extends SymbolChoice {
  symbol: SymbolInfo;
  onChange: (choice: SymbolChoice) => void;
}

export function SymbolFields({ symbol, identity, echelon, modifiers, onChange }: Props) {
  // mil-sym's modifier lists occasionally carry blank entries.
  const keys = symbol.modifiers.filter((key) => key.trim() !== "");
  const known = KNOWN_MODIFIERS.filter((key) => keys.includes(key));
  const others = keys.filter((key) => !KNOWN_MODIFIERS.includes(key));
  const change = (patch: Partial<SymbolChoice>) =>
    onChange({ identity, echelon, modifiers, ...patch });
  const field = (key: string) => (
    <label key={key}>
      {modifierLabel(key)}
      <input
        value={modifiers[key] ?? ""}
        onChange={(e) => change({ modifiers: { ...modifiers, [key]: e.target.value } })}
      />
    </label>
  );

  return (
    <div className="symbol-fields">
      <label>
        Identité
        <select value={identity} onChange={(e) => change({ identity: e.target.value })}>
          {IDENTITIES.map((i) => (
            <option key={i.code} value={i.code}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
      {hasEchelon(symbol.basicId) && (
        <label>
          Échelon
          <select value={echelon} onChange={(e) => change({ echelon: e.target.value })}>
            {ECHELONS.map((e) => (
              <option key={e.code} value={e.code}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {known.map(field)}
      {others.length > 0 && (
        <details open={known.length === 0}>
          <summary>Autres champs</summary>
          {others.map(field)}
        </details>
      )}
    </div>
  );
}
```

`web/src/symbols/SymbolIcon.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSymbolIcon } from "../api/geomap";
import { errorMessage } from "../api/client";

export function SymbolIcon({
  sidc,
  modifiers,
  alt,
}: {
  sidc: string;
  modifiers: Record<string, string>;
  alt: string;
}) {
  const icon = useQuery({
    queryKey: ["icon", sidc, modifiers],
    queryFn: () => fetchSymbolIcon(sidc, modifiers),
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!icon.data) return;
    const objectUrl = URL.createObjectURL(icon.data.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [icon.data]);

  if (icon.error) return <p role="alert">{errorMessage(icon.error)}</p>;
  return url ? <img className="symbol-icon" src={url} alt={alt} /> : null;
}
```

If the `react-hooks` lint rejects `setUrl` inside the effect, derive the URL with `useMemo` from `icon.data` and revoke it in an effect cleanup instead; ledger the choice.

`web/src/symbols/SymbolPicker.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchSymbols, type SymbolInfo } from "../api/geomap";
import { errorMessage } from "../api/client";
import { buildSidc, filledModifiers, GEOMETRY_LABELS, groupByCategory, hasEchelon } from "./sidc";
import { SymbolFields, type SymbolChoice } from "./SymbolFields";
import { SymbolIcon } from "./SymbolIcon";

export interface PlacedSymbol {
  symbol: SymbolInfo;
  sidc: string;
  modifiers: Record<string, string>;
}

const FRESH: SymbolChoice = { identity: "3", echelon: "00", modifiers: {} };

export function SymbolPicker({ onPlace }: { onPlace: (placed: PlacedSymbol) => void }) {
  const [query, setQuery] = useState("");
  const [symbol, setSymbol] = useState<SymbolInfo | null>(null);
  const [choice, setChoice] = useState<SymbolChoice>(FRESH);
  const results = useQuery({
    queryKey: ["symbols", query],
    queryFn: () => searchSymbols(query),
    enabled: query.trim().length >= 2,
  });
  const sidc = symbol
    ? buildSidc(symbol.basicId, choice.identity, hasEchelon(symbol.basicId) ? choice.echelon : "00")
    : null;
  const modifiers = filledModifiers(choice.modifiers);

  return (
    <section className="symbol-picker">
      <label>
        Rechercher un symbole
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {results.error && <p role="alert">{errorMessage(results.error)}</p>}
      {groupByCategory(results.data ?? []).map(([category, symbols]) => (
        <div key={category}>
          <h3>{category}</h3>
          {symbols.map((s) => (
            <button
              key={s.basicId}
              className={s.basicId === symbol?.basicId ? "selected" : undefined}
              onClick={() => {
                setSymbol(s);
                setChoice(FRESH);
              }}
            >
              {s.name} <small>{s.path}</small>
            </button>
          ))}
        </div>
      ))}
      {symbol && sidc && (
        <div className="symbol-choice">
          <p>
            <strong>{symbol.name.trim()}</strong> · {GEOMETRY_LABELS[symbol.geometry]}
            {symbol.geometry !== "POINT" && ` · ${symbol.minPoints} à ${symbol.maxPoints} points`}
          </p>
          <SymbolFields symbol={symbol} {...choice} onChange={setChoice} />
          {symbol.geometry === "POINT" && (
            <SymbolIcon sidc={sidc} modifiers={modifiers} alt={`Aperçu ${symbol.name.trim()}`} />
          )}
          <button onClick={() => onPlace({ symbol, sidc, modifiers })}>Placer sur la carte</button>
        </div>
      )}
    </section>
  );
}
```

`web/src/api/geomap.ts` keeps its own private `filled` helper from Task 2; replace it with an import of `filledModifiers` from `../symbols/sidc` only if that creates no import cycle (it does not: `sidc.ts` imports only types).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test -- src/symbols`
Expected: PASS (6 + 3 tests).

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): pick an APP-6D symbol and build its SIDC"
```

---

### Task 4: Place and reshape APP-6D objects

**Files:**
- Modify: `web/src/map/drawing.ts`, `web/src/map/useDrawing.ts`, `web/src/editor/MissionEditorPage.tsx`, `web/src/editor/FeaturePanel.tsx`, `web/src/index.css`
- Test: `web/src/map/drawing.test.ts`, `web/src/editor/FeaturePanel.test.tsx`

**Interfaces:**
- Consumes: `PlacedSymbol`, `SymbolPicker`, `SymbolFields`, `SymbolIcon`, `buildSidc`, `parseSidc`, `hasEchelon`, `filledModifiers` (Task 3); `describeSymbol` (Task 2); `drawnToInput`, `toDrawFeature`, `useDrawing` (web-1).
- Produces:
  - `drawing.ts`: `modeFor(geometry: SymbolGeometry): DrawMode` (`POINT`→`point`, `LINE`→`linestring`, `AREA`→`polygon`), `controlPointCount(geometry: Geometry): number`, `drawnToInput(drawn, base?: Feature, placed?: PlacedSymbol)` — with `placed`, returns an `APP6` input with its SIDC and modifiers, or a French error when the number of points is outside `minPoints..maxPoints`; with an `APP6` base, keeps kind, SIDC and modifiers. `toDrawFeature` opens `APP6` objects too (never as circles).
  - Editor: a "Symbole APP-6D" section with `SymbolPicker`; placing switches Terra Draw to `modeFor(symbol.geometry)` and the next finished shape becomes that symbol.
  - `FeaturePanel` details for `APP6` objects: identity, echelon and modifier fields (via `describeSymbol(feature.sidc)`), saved with the rebuilt SIDC.

- [ ] **Step 1: Write the failing tests**

In `web/src/map/drawing.test.ts`, delete the assertion that an APP-6D object gives `null` (`expect(toDrawFeature(feature({ kind: "APP6", … }))).toBeNull();`), add `drawnToInput`, `modeFor` and `controlPointCount` to the imports from `./drawing` and `import type { SymbolInfo } from "../api/geomap";`, then append:

```ts
const battlePosition: SymbolInfo = {
  basicId: "25151200",
  name: "Battle Position",
  path: "Control Measure / Maneuver Areas",
  geometry: "AREA",
  minPoints: 3,
  maxPoints: 50,
  modifiers: ["B", "T"],
};
const placed = { symbol: battlePosition, sidc: "10032500001512000000", modifiers: { T: "BP1" } };
const square = {
  type: "Polygon" as const,
  coordinates: [
    [
      [2, 48],
      [3, 48],
      [3, 49],
      [2, 49],
      [2, 48],
    ],
  ],
};

it("maps symbol geometries to drawing modes", () => {
  expect(modeFor("POINT")).toBe("point");
  expect(modeFor("LINE")).toBe("linestring");
  expect(modeFor("AREA")).toBe("polygon");
});

it("counts control points, not the closing vertex", () => {
  expect(controlPointCount(square)).toBe(4);
  expect(controlPointCount({ type: "Point", coordinates: [2, 48] })).toBe(1);
});

it("turns a drawn shape into the placed APP-6D symbol", () => {
  expect(drawnToInput(drawn(square, "polygon"), undefined, placed)).toEqual({
    input: {
      kind: "APP6",
      geometry: square,
      name: "",
      description: "",
      style: null,
      sidc: "10032500001512000000",
      modifiers: { T: "BP1" },
    },
  });
});

it("refuses a symbol drawn with too few points, in French", () => {
  const needsFive = { ...placed, symbol: { ...battlePosition, minPoints: 5 } };
  expect(drawnToInput(drawn(square, "polygon"), undefined, needsFive)).toEqual({
    error: "Ce symbole demande de 5 à 50 points (4 tracés).",
  });
});

it("keeps kind, SIDC and modifiers when an APP-6D object is reshaped", () => {
  const base = feature({
    kind: "APP6",
    sidc: "10032500001512000000",
    modifiers: { T: "BP1" },
    name: "BP nord",
    geometry: square,
  });
  expect(drawnToInput(drawn(square, "polygon"), base)).toMatchObject({
    input: {
      kind: "APP6",
      sidc: "10032500001512000000",
      modifiers: { T: "BP1" },
      name: "BP nord",
    },
  });
});

it("opens an APP-6D object for reshaping in its geometry's mode", () => {
  const point = feature({ kind: "APP6", sidc: "10031000161211000000" });
  expect(toDrawFeature(point)?.properties.mode).toBe("point");
});
```

Append to `web/src/editor/FeaturePanel.test.tsx`:

```tsx
it("changes an APP-6D object's identity and designation, keeping its geometry", async () => {
  const unit = feature({
    id: "u1",
    name: "1ER RI",
    kind: "APP6",
    sidc: "10031000161211000000",
    modifiers: { T: "1ER RI" },
  });
  let body: Partial<Feature> | undefined;
  server.use(
    http.get("/api/symbols/10031000161211000000", () =>
      HttpResponse.json({
        basicId: "10121100",
        name: "Infantry",
        path: "Land Unit / Movement and Maneuver",
        geometry: "POINT",
        minPoints: 1,
        maxPoints: 1,
        modifiers: ["T", "H"],
      }),
    ),
    http.get("/api/symbols/:sidc/icon.png", () =>
      HttpResponse.arrayBuffer(new Uint8Array([1]).buffer, {
        headers: { "X-Anchor-X": "1", "X-Anchor-Y": "1" },
      }),
    ),
    http.put(`${path}/u1`, async ({ request }) => {
      body = (await request.json()) as Partial<Feature>;
      return HttpResponse.json(unit);
    }),
    http.get(path, () => HttpResponse.json([])),
  );
  renderWithProviders(
    <FeaturePanel missionId={missionId} features={[unit]} selectedId="u1" onSelect={vi.fn()} />,
  );
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText("Identité"), "6");
  const designation = screen.getByLabelText("Désignation");
  await user.clear(designation);
  await user.type(designation, "2E RI");
  await user.click(screen.getByRole("button", { name: "Enregistrer l'objet" }));
  await waitFor(() =>
    expect(body).toMatchObject({
      kind: "APP6",
      geometry: unit.geometry,
      sidc: "10061000161211000000",
      modifiers: { T: "2E RI" },
    }),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/map/drawing.test.ts src/editor/FeaturePanel.test.tsx`
Expected: FAIL — `modeFor`/`controlPointCount` not exported; no APP-6D fields in the panel.

- [ ] **Step 3: Write minimal implementation**

In `web/src/map/drawing.ts`:

1. Add imports: `import type { FeatureKind, SymbolGeometry } from "../api/geomap";` (merge with the existing `../api/geomap` import) and `import type { PlacedSymbol } from "../symbols/SymbolPicker";`.
2. Add:

```ts
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
```

3. In `toFeatureInput`, type `common.kind` as `FeatureKind`, and replace its last two lines (after the circle branch) with:

```ts
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
```

4. Replace `drawnToInput` with:

```ts
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
      input: { ...input, kind: "APP6", style: null, sidc: placed.sidc, modifiers: placed.modifiers },
    };
  } catch (e) {
    return { error: `Forme invalide : ${e instanceof Error ? e.message : String(e)}` };
  }
}
```

5. In `toDrawFeature`, remove the `if (feature.kind !== "GENERIC") return null;` guard and take the circle branch only for generic objects: `if (feature.kind === "GENERIC" && isCircle(feature)) { … }`. Keep the return type `GeoJSONStoreFeatures | null`.

In `web/src/map/useDrawing.ts`, change the `edit` message for a `null` result to `"Cet objet ne se modifie pas sur la carte."`.

In `web/src/editor/MissionEditorPage.tsx`:

- Import `SymbolPicker`, `type PlacedSymbol` from `../symbols/SymbolPicker` and `modeFor` from `../map/drawing`.
- Add `const [placing, setPlacing] = useState<PlacedSymbol | null>(null);` and `const placingRef = useRef(placing);`, kept in step in the existing ref-sync effect (`placingRef.current = placing;`) so the Terra Draw handler reads the current value.
- Replace `onCreate` with:

```tsx
    onCreate: (drawn) => {
      const placed = placingRef.current ?? undefined;
      const converted = drawnToInput(drawn, undefined, placed);
      if ("error" in converted) return setDrawError(converted.error);
      setDrawError(null);
      createFeature(missionId, converted.input).then(
        () => {
          if (placed) {
            setPlacing(null);
            drawing.stopEditing();
          }
          return refreshFeatures();
        },
        (e: unknown) => setDrawError(errorMessage(e)),
      );
    },
```

- In `select`, open every object `toDrawFeature` accepts: `if (feature) setDrawError(drawing.edit(feature)); else drawing.stopEditing();` (update the comment accordingly).
- The toolbar's `onMode` also calls `setPlacing(null)`.
- In the `<aside>`, after `DrawToolbar`, add:

```tsx
        <details>
          <summary>Symbole APP-6D</summary>
          <SymbolPicker
            onPlace={(placed) => {
              setSelectedId(null);
              setPlacing(placed);
              drawing.setMode(modeFor(placed.symbol.geometry));
            }}
          />
          {placing && (
            <p role="status">
              Tracez « {placing.symbol.name.trim()} » sur la carte ({placing.symbol.minPoints} à{" "}
              {placing.symbol.maxPoints} points).
            </p>
          )}
        </details>
```

In `web/src/editor/FeaturePanel.tsx`:

- Extend `Changes` with `sidc?: string; modifiers?: Record<string, string>` and send them in `onSave`: `sidc: changes.sidc ?? selected.sidc`, `modifiers: changes.modifiers ?? selected.modifiers`.
- In `FeatureDetails`, for `feature.kind === "APP6" && feature.sidc`:
  - load `useQuery({ queryKey: ["symbol", feature.sidc], queryFn: () => describeSymbol(feature.sidc!) })` (the hook is always called; `enabled: feature.kind === "APP6" && !!feature.sidc`);
  - keep `choice` state `{ ...parseSidc(feature.sidc) minus basicId, modifiers: feature.modifiers ?? {} }` as a `SymbolChoice`;
  - render `<SymbolFields symbol={symbol.data} {...choice} onChange={setChoice} />` once loaded, a `<SymbolIcon>` preview for point symbols, and a `role="alert"` with `errorMessage(symbol.error)` if loading fails;
  - on submit add `sidc: buildSidc(symbol.data.basicId, choice.identity, hasEchelon(symbol.data.basicId) ? choice.echelon : "00")` and `modifiers: filledModifiers(choice.modifiers)`.

`web/src/index.css` — append:

```css
.symbol-picker button,
.symbol-picker small {
  display: block;
  text-align: left;
}
.symbol-picker .selected {
  font-weight: bold;
}
.symbol-fields label {
  display: flex;
  flex-direction: column;
}
.symbol-icon {
  max-width: 64px;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS — the new drawing and FeaturePanel tests and every earlier test.

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): place, reshape and edit APP-6D objects"
```

---

### Task 5: Draw APP-6D icons and tactical graphics on the map

**Files:**
- Create: `web/src/map/symbolLayer.ts`, `web/src/map/useSymbolRendering.ts`
- Modify: `web/src/map/missionLayer.ts`, `web/src/editor/MissionEditorPage.tsx`
- Test: `web/src/map/symbolLayer.test.ts`, `web/src/map/missionLayer.test.ts`

**Interfaces:**
- Consumes: `fetchSymbolIcon`, `renderGraphic`, `GraphicCollection` (Task 2); `MAP_FONTS` (web-1).
- Produces:
  - `symbolLayer.ts`: `type Band = "LOW" | "MID" | "HIGH"`, `bandOf(zoom: number): Band`, `ZOOM_FOR_BAND` (`LOW: 8`, `MID: 12`, `HIGH: 16`), `symbolKey(sidc, modifiers | null): string`, `iconOffset(anchorX, anchorY, width, height): [number, number]`, `SYMBOL_SOURCE = "symbols"`, `TACTICAL_SOURCE = "tactical"`, `pointSymbols(features, offsets: Map<string, [number, number]>, hiddenId?)` (APP-6D points whose icon is loaded; properties `id`, `icon`, `offset`, `pending`), `tacticalCollection(renders: { featureId: string; collection: GraphicCollection }[])` (adds `featureId`, `textAnchor`, `textOffset`), `SYMBOL_LAYERS`, `SYMBOL_CLICKABLE_LAYERS`, `addSymbolLayers(map)`.
  - `missionLayer.ts`: feature properties gain `kind`; generic layers only draw `GENERIC`; new clickable layer `mission-app6-control` draws APP-6D lines and areas as thin dashed control lines; APP-6D points are left to the symbol layer.
  - `useSymbolRendering(map, features, hiddenId): { error: string | null }`.

- [ ] **Step 1: Write the failing tests**

`web/src/map/symbolLayer.test.ts`:

```ts
import { feature } from "../test/fixtures";
import {
  bandOf,
  iconOffset,
  pointSymbols,
  symbolKey,
  SYMBOL_LAYERS,
  tacticalCollection,
} from "./symbolLayer";
import { MAP_FONTS } from "./style";

it("picks the server's zoom bands", () => {
  expect([0, 10, 10.9, 11, 14.99, 15, 22].map(bandOf)).toEqual([
    "LOW",
    "LOW",
    "LOW",
    "MID",
    "MID",
    "HIGH",
    "HIGH",
  ]);
});

it("keys icons by SIDC and modifiers regardless of order", () => {
  expect(symbolKey("10031000161211000000", { T: "1", H: "x" })).toBe(
    symbolKey("10031000161211000000", { H: "x", T: "1" }),
  );
  expect(symbolKey("10031000161211000000", null)).not.toBe(
    symbolKey("10031000161211000000", { T: "1" }),
  );
});

it("shifts the icon so its anchor, not its centre, sits on the position", () => {
  expect(iconOffset(40, 33, 80, 60)).toEqual([0, -3]);
  expect(iconOffset(10, 10, 20, 20)).toEqual([0, 0]);
});

it("lists APP-6D points whose icon is ready, with their offset", () => {
  const unit = feature({ id: "u", kind: "APP6", sidc: "10031000161211000000", modifiers: { T: "1" } });
  const line = feature({
    id: "l",
    kind: "APP6",
    sidc: "10032500001401000000",
    geometry: {
      type: "LineString",
      coordinates: [
        [2, 48],
        [3, 48],
      ],
    },
  });
  const key = symbolKey(unit.sidc!, unit.modifiers);
  const collection = pointSymbols([unit, line, feature()], new Map([[key, [0, -3]]]));
  expect(collection.features.map((f) => f.properties)).toEqual([
    { id: "u", icon: key, offset: [0, -3], pending: false },
  ]);
  expect(pointSymbols([unit], new Map()).features).toEqual([]);
});

it("turns mil-sym label placement into MapLibre text properties", () => {
  const collection = tacticalCollection([
    {
      featureId: "l",
      collection: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [2, 48] },
            properties: { label: "BP1", labelAlign: "right", anchorOffsetX: -6, anchorOffsetY: 6 },
          },
        ],
      },
    },
  ]);
  expect(collection.features[0].properties).toMatchObject({
    featureId: "l",
    label: "BP1",
    textAnchor: "right",
    textOffset: [-0.5, 0.5],
  });
});

it("labels tactical graphics with a shipped font", () => {
  const label = SYMBOL_LAYERS.find((l) => l.id === "tactical-label") as {
    layout?: Record<string, unknown>;
  };
  expect(MAP_FONTS).toContain((label.layout?.["text-font"] as string[])[0]);
});
```

Append to `web/src/map/missionLayer.test.ts` (import `MISSION_LAYERS` if missing; add `kind: "GENERIC"` to the expected properties of the earlier "draws generic objects with their colour and name" test):

```ts
it("tags objects with their kind and keeps APP-6D control lines clickable", () => {
  const collection = toFeatureCollection([
    feature({ id: "g" }),
    feature({ id: "a", kind: "APP6", sidc: "10031000161211000000" }),
  ]);
  expect(collection.features.map((f) => [f.properties.id, f.properties.kind])).toEqual([
    ["g", "GENERIC"],
    ["a", "APP6"],
  ]);
  expect(MISSION_LAYERS.map((l) => l.id)).toContain("mission-app6-control");
  expect(CLICKABLE_LAYERS).toContain("mission-app6-control");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/map/symbolLayer.test.ts src/map/missionLayer.test.ts`
Expected: FAIL — `Failed to resolve import "./symbolLayer"`; `kind` missing from mission properties.

- [ ] **Step 3: Write minimal implementation**

`web/src/map/symbolLayer.ts`:

```ts
import type * as maplibregl from "maplibre-gl";
import type { LayerSpecification } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { Feature, GraphicCollection } from "../api/geomap";
import { MAP_FONTS } from "./style";

export type Band = "LOW" | "MID" | "HIGH";

export const SYMBOL_SOURCE = "symbols";
export const TACTICAL_SOURCE = "tactical";

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

// MapLibre centres the image on the point; the symbol's own centre is at (anchorX, anchorY).
export function iconOffset(
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
): [number, number] {
  return [width / 2 - anchorX, height / 2 - anchorY];
}

export function pointSymbols(
  features: Feature[],
  offsets: Map<string, [number, number]>,
  hiddenId: string | null = null,
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: features.flatMap((f) => {
      if (f.kind !== "APP6" || !f.sidc || f.geometry.type !== "Point") return [];
      if (f.suggestionStatus === "REJECTED" || f.id === hiddenId) return [];
      const key = symbolKey(f.sidc, f.modifiers);
      const offset = offsets.get(key);
      if (!offset) return [];
      return [
        {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: { id: f.id, icon: key, offset, pending: f.suggestionStatus === "PENDING" },
        },
      ];
    }),
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
            textAnchor: ["left", "right", "center"].includes(p.labelAlign) ? p.labelAlign : "center",
            // mil-sym offsets are pixels; MapLibre's text-offset is in ems.
            textOffset: [
              Number(p.anchorOffsetX ?? 0) / LABEL_FONT_SIZE,
              Number(p.anchorOffsetY ?? 0) / LABEL_FONT_SIZE,
            ],
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
      "text-offset": ["get", "textOffset"],
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
    id: "mission-symbol",
    type: "symbol",
    source: SYMBOL_SOURCE,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-offset": ["get", "offset"],
      "icon-allow-overlap": true,
    },
    paint: { "icon-opacity": ["case", ["get", "pending"], 0.6, 1] },
  },
];

export const SYMBOL_CLICKABLE_LAYERS = ["mission-symbol", "tactical-line"];

export function addSymbolLayers(map: maplibregl.Map): void {
  const empty = { type: "FeatureCollection" as const, features: [] };
  map.addSource(SYMBOL_SOURCE, { type: "geojson", data: empty });
  map.addSource(TACTICAL_SOURCE, { type: "geojson", data: empty });
  for (const layer of SYMBOL_LAYERS) map.addLayer(layer);
}
```

(If a data-driven `text-anchor`, `text-offset` or `icon-offset` does not type-check against maplibre-gl 6.11.2's `LayerSpecification`, keep the expression and cast the layer; if MapLibre rejects it at runtime, the Playwright journey will show it — ledger the fix.)

In `web/src/map/missionLayer.ts`:

- Add `kind: f.kind` to each feature's properties (and `kind: FeatureKind` to the properties interface).
- Wrap the filters of `mission-fill`, `mission-line`, `mission-line-pending`, `mission-point` and `mission-label` with `["all", ["==", ["get", "kind"], "GENERIC"], <existing filter>]` (the label layer had none: use the generic filter alone).
- After `mission-point`, add this layer and append `"mission-app6-control"` to `CLICKABLE_LAYERS`:

```ts
  {
    id: "mission-app6-control",
    type: "line",
    source: MISSION_SOURCE,
    filter: ["all", ["==", ["get", "kind"], "APP6"], lines],
    paint: { "line-color": "#6c6f85", "line-width": 1, "line-dasharray": [2, 2] },
  },
```

`web/src/map/useSymbolRendering.ts` (not unit-tested: MapLibre images and `createImageBitmap` need a real browser; covered by the Playwright journey):

```ts
import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { fetchSymbolIcon, renderGraphic, type Feature } from "../api/geomap";
import { errorMessage } from "../api/client";
import {
  bandOf,
  iconOffset,
  pointSymbols,
  symbolKey,
  SYMBOL_SOURCE,
  TACTICAL_SOURCE,
  tacticalCollection,
  ZOOM_FOR_BAND,
  type Band,
} from "./symbolLayer";

const isGraphic = (f: Feature) =>
  f.kind === "APP6" && !!f.sidc && f.geometry.type !== "Point" && f.suggestionStatus !== "REJECTED";

export function useSymbolRendering(
  map: maplibregl.Map | null,
  features: Feature[] | undefined,
  hiddenId: string | null,
): { error: string | null } {
  const [band, setBand] = useState<Band>("MID");
  const [iconError, setIconError] = useState<string | null>(null);
  const [offsets, setOffsets] = useState(new Map<string, [number, number]>());
  const loading = useRef(new Set<string>());

  useEffect(() => {
    if (!map) return;
    const update = () => setBand(bandOf(map.getZoom()));
    update();
    map.on("zoomend", update);
    return () => void map.off("zoomend", update);
  }, [map]);

  useEffect(() => {
    if (!map || !features) return;
    for (const f of features) {
      if (f.kind !== "APP6" || !f.sidc || f.geometry.type !== "Point") continue;
      const key = symbolKey(f.sidc, f.modifiers);
      if (map.hasImage(key) || loading.current.has(key)) continue;
      loading.current.add(key);
      fetchSymbolIcon(f.sidc, f.modifiers ?? {})
        .then(async ({ blob, anchorX, anchorY }) => {
          const bitmap = await createImageBitmap(blob);
          if (map._removed) return;
          if (!map.hasImage(key)) map.addImage(key, bitmap);
          setOffsets((current) =>
            new Map(current).set(key, iconOffset(anchorX, anchorY, bitmap.width, bitmap.height)),
          );
        })
        .catch((e: unknown) => setIconError(`Symbole illisible : ${errorMessage(e)}`))
        .finally(() => loading.current.delete(key));
    }
  }, [map, features]);

  const graphics = (features ?? []).filter(isGraphic);
  const renders = useQueries({
    queries: graphics.map((f) => ({
      queryKey: ["graphic", f.id, f.updatedAt, band],
      queryFn: () => renderGraphic(f.sidc!, f.geometry, f.modifiers ?? {}, ZOOM_FOR_BAND[band]),
      staleTime: Infinity,
    })),
  });

  const rendered = renders.map((r) => r.data);
  useEffect(() => {
    if (!map || map._removed || !features) return;
    map.getSource<GeoJSONSource>(SYMBOL_SOURCE)?.setData(pointSymbols(features, offsets, hiddenId));
    const done = graphics.flatMap((f, i) => {
      const collection = rendered[i];
      return collection && f.id !== hiddenId ? [{ featureId: f.id, collection }] : [];
    });
    map.getSource<GeoJSONSource>(TACTICAL_SOURCE)?.setData(tacticalCollection(done));
  });

  const graphicError = renders.find((r) => r.error)?.error;
  return {
    error: iconError ?? (graphicError ? `Graphisme illisible : ${errorMessage(graphicError)}` : null),
  };
}
```

If `react-hooks` lint flags the effect without a dependency list or the `setBand` call inside the `map` effect, adjust with the smallest change that keeps the behaviour (e.g. seed `band` when the map changes through an event callback) and ledger it.

In `web/src/editor/MissionEditorPage.tsx`:

- In `onReady`, call `addSymbolLayers(ready)` right after `addMissionLayers(ready)` (import from `../map/symbolLayer`).
- Add `const symbols = useSymbolRendering(map, features.data, editingId);` next to the other hooks (above the early returns; move the `editingId` computation above it) and render `{symbols.error && <p role="alert">{symbols.error}</p>}` after the draw error.
- The map click handler listens on `[...CLICKABLE_LAYERS, ...SYMBOL_CLICKABLE_LAYERS]` and reads the object id from `properties.id ?? properties.featureId`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS — 6 symbolLayer tests, the new missionLayer test and every earlier test.

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): draw APP-6D icons and tactical graphics on the map"
```

---

### Task 6: Validator, publication, versions, SD export and withdrawal

**Files:**
- Create: `web/src/files.ts`, `web/src/editor/PublicationPanel.tsx`
- Modify: `web/src/editor/MissionEditorPage.tsx`, `web/src/index.css`
- Test: `web/src/editor/PublicationPanel.test.tsx`

**Interfaces:**
- Consumes: `getValidation`, `publishMission`, `listVersions`, `downloadPackage`, `withdrawMission`, `Mission`, `ValidationIssue` (Task 2); `formatUtc` (web-1).
- Produces:
  - `files.ts`: `saveFile(blob: Blob, filename: string): void` (object URL + temporary `<a download>`).
  - `PublicationPanel({ mission, revision, onSelectFeature })` — `revision` changes whenever the mission or its objects change (the editor passes `` `${mission.dataUpdatedAt}-${features.dataUpdatedAt}` ``), so the validation is refetched. After publishing or withdrawing it invalidates `["mission", id]`, `["missions"]`, `["versions", id]` and `["validation", id]`.
  - `VALIDATION_LABELS: Record<string, string>`.

- [ ] **Step 1: Write the failing test**

`web/src/editor/PublicationPanel.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { mission } from "../test/fixtures";
import type { PublicationView, ValidationReport } from "../api/geomap";
import { PublicationPanel } from "./PublicationPanel";
import { saveFile } from "../files";

vi.mock("../files", () => ({ saveFile: vi.fn() }));

const id = "11111111-1111-4111-8111-111111111111";
const base = `/api/missions/${id}`;
const v1: PublicationView = {
  missionId: id,
  version: 1,
  sha256: "c".repeat(64),
  sizeBytes: 12_288,
  recipients: 2,
  publishedBy: "alice",
  publishedAt: "2026-09-28T10:00:00Z",
};

function serve(report: ValidationReport, versions: PublicationView[] = []) {
  server.use(
    http.get(`${base}/validation`, () => HttpResponse.json(report)),
    http.get(`${base}/versions`, () => HttpResponse.json(versions)),
  );
}

function panel(overrides = {}, onSelectFeature = vi.fn()) {
  renderWithProviders(
    <PublicationPanel
      mission={mission(overrides)}
      revision="r1"
      onSelectFeature={onSelectFeature}
    />,
  );
  return onSelectFeature;
}

it("lists blocking errors in French, links them to their object and blocks publication", async () => {
  serve({
    errors: [
      { code: "NO_RECIPIENT", message: "no enrolled device", featureId: null },
      { code: "SYMBOL_NOT_RENDERABLE", message: "cannot render", featureId: "f1" },
    ],
    warnings: [{ code: "PENDING_SUGGESTIONS", message: "1 pending", featureId: null }],
  });
  const onSelectFeature = panel();
  expect(await screen.findByText("Aucun terminal enrôlé affecté")).toBeInTheDocument();
  expect(screen.getByText("Suggestions IA en attente")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Publier/ })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Symbole impossible à afficher" }));
  expect(onSelectFeature).toHaveBeenCalledWith("f1");
});

it("publishes a valid mission and shows the new version", async () => {
  serve({ errors: [], warnings: [] });
  server.use(
    http.post(`${base}/publish`, () => {
      serve({ errors: [], warnings: [] }, [v1]);
      return HttpResponse.json(v1, { status: 201 });
    }),
  );
  panel();
  expect(await screen.findByText("Aucune erreur bloquante.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Publier la version 1" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Version 1 publiée pour 2 terminaux.",
  );
  const history = await screen.findByRole("list", { name: "Versions publiées" });
  expect(
    within(history).getByText(/v1 — 2026-09-28 10:00Z par alice — 2 terminaux — 12 Ko/),
  ).toBeInTheDocument();
});

it("shows the server's refusal when publishing fails", async () => {
  serve({ errors: [], warnings: [] });
  server.use(
    http.post(`${base}/publish`, () =>
      HttpResponse.json(
        { status: 409, detail: "mission is not publishable: NO_RECIPIENT" },
        { status: 409 },
      ),
    ),
  );
  panel();
  await userEvent.click(await screen.findByRole("button", { name: "Publier la version 1" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "mission is not publishable: NO_RECIPIENT",
  );
});

it("exports the latest package for an SD card", async () => {
  serve({ errors: [], warnings: [] }, [v1]);
  server.use(
    http.get(`${base}/package`, () =>
      HttpResponse.arrayBuffer(new Uint8Array([71, 77, 80, 49]).buffer, {
        headers: { "Content-Disposition": `attachment; filename="${id}-v1.gmp"` },
      }),
    ),
  );
  panel({ status: "PUBLISHED" });
  await userEvent.click(await screen.findByRole("button", { name: "Exporter pour carte SD" }));
  await waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), `${id}-v1.gmp`));
});

it("withdraws a published mission only after confirmation", async () => {
  serve({ errors: [], warnings: [] }, [v1]);
  const withdrawn = vi.fn();
  server.use(
    http.post(`${base}/withdraw`, () => {
      withdrawn();
      return HttpResponse.json(mission({ status: "WITHDRAWN" }));
    }),
  );
  panel({ status: "PUBLISHED" });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Retirer la mission" }));
  expect(withdrawn).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirmer le retrait" }));
  await waitFor(() => expect(withdrawn).toHaveBeenCalled());
});

it("offers neither publication nor export once withdrawn", async () => {
  serve({ errors: [], warnings: [] }, [v1]);
  panel({ status: "WITHDRAWN" });
  expect(
    await screen.findByText("Mission retirée : les terminaux la suppriment au prochain contact."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Publier/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Exporter pour carte SD" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- src/editor/PublicationPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./PublicationPanel"` / `"../files"`.

- [ ] **Step 3: Write minimal implementation**

`web/src/files.ts`:

```ts
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

`web/src/editor/PublicationPanel.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  downloadPackage,
  getValidation,
  listVersions,
  publishMission,
  withdrawMission,
  type Mission,
  type ValidationIssue,
} from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc } from "../format";
import { saveFile } from "../files";

export const VALIDATION_LABELS: Record<string, string> = {
  NO_BASEMAP: "Aucun fond de carte",
  UNKNOWN_BASEMAP: "Fond de carte inconnu",
  NO_EXPIRY: "Aucune date de validité",
  EXPIRED: "Date de validité dépassée",
  NO_RECIPIENT: "Aucun terminal enrôlé affecté",
  SYMBOL_NOT_RENDERABLE: "Symbole impossible à afficher",
  PENDING_SUGGESTIONS: "Suggestions IA en attente",
  EMPTY_MISSION: "Mission vide",
};

interface Props {
  mission: Mission;
  revision: string;
  onSelectFeature: (featureId: string) => void;
}

const terminals = (n: number) => `${n} terminal${n > 1 ? "aux" : ""}`;

export function PublicationPanel({ mission, revision, onSelectFeature }: Props) {
  const queryClient = useQueryClient();
  const validation = useQuery({
    queryKey: ["validation", mission.id, revision],
    queryFn: () => getValidation(mission.id),
  });
  const versions = useQuery({
    queryKey: ["versions", mission.id],
    queryFn: () => listVersions(mission.id),
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const withdrawn = mission.status === "WITHDRAWN";
  const published = (versions.data?.length ?? 0) > 0;
  const nextVersion = Math.max(0, ...(versions.data ?? []).map((v) => v.version)) + 1;
  const blocked = !validation.data || validation.data.errors.length > 0;

  async function run(action: () => Promise<string | null>) {
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await Promise.all(
        [["mission", mission.id], ["missions"], ["versions", mission.id], ["validation", mission.id]].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const issue = (i: ValidationIssue, index: number) => {
    const label = VALIDATION_LABELS[i.code] ?? i.message;
    return (
      <li key={`${i.code}-${index}`} title={i.message}>
        {i.featureId ? (
          <button className="link" onClick={() => onSelectFeature(i.featureId!)}>
            {label}
          </button>
        ) : (
          label
        )}
      </li>
    );
  };

  return (
    <section className="publication">
      <h2>Publication</h2>
      {validation.error && <p role="alert">{errorMessage(validation.error)}</p>}
      {validation.data &&
        (validation.data.errors.length === 0 ? (
          <p>Aucune erreur bloquante.</p>
        ) : (
          <ul aria-label="Erreurs bloquantes" className="errors">
            {validation.data.errors.map(issue)}
          </ul>
        ))}
      {validation.data && validation.data.warnings.length > 0 && (
        <ul aria-label="Avertissements" className="warnings">
          {validation.data.warnings.map(issue)}
        </ul>
      )}
      {withdrawn ? (
        <p>Mission retirée : les terminaux la suppriment au prochain contact.</p>
      ) : (
        <div className="actions">
          <button
            disabled={blocked}
            onClick={() =>
              void run(async () => {
                const v = await publishMission(mission.id);
                return `Version ${v.version} publiée pour ${terminals(v.recipients)}.`;
              })
            }
          >
            Publier la version {nextVersion}
          </button>
          {published && (
            <button
              onClick={() =>
                void run(async () => {
                  const file = await downloadPackage(mission.id);
                  saveFile(file.blob, file.filename);
                  return null;
                })
              }
            >
              Exporter pour carte SD
            </button>
          )}
          {published &&
            (confirmWithdraw ? (
              <>
                <button
                  onClick={() =>
                    void run(async () => {
                      await withdrawMission(mission.id);
                      setConfirmWithdraw(false);
                      return "Mission retirée.";
                    })
                  }
                >
                  Confirmer le retrait
                </button>
                <button onClick={() => setConfirmWithdraw(false)}>Annuler</button>
              </>
            ) : (
              <button onClick={() => setConfirmWithdraw(true)}>Retirer la mission</button>
            ))}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {versions.error && <p role="alert">{errorMessage(versions.error)}</p>}
      {published && (
        <ul aria-label="Versions publiées">
          {[...versions.data!]
            .sort((a, b) => b.version - a.version)
            .map((v) => (
              <li key={v.version}>
                v{v.version} — {formatUtc(v.publishedAt)} par {v.publishedBy} —{" "}
                {terminals(v.recipients)} — {Math.ceil(v.sizeBytes / 1024)} Ko
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
```

`web/src/editor/MissionEditorPage.tsx` — render after the `FeaturePanel` (import `PublicationPanel`):

```tsx
        <PublicationPanel
          mission={current}
          revision={`${mission.dataUpdatedAt}-${features.dataUpdatedAt}`}
          onSelectFeature={(featureId) => {
            const target = features.data?.find((f) => f.id === featureId);
            if (target) select(target);
          }}
        />
```

`web/src/index.css` — append:

```css
.publication .errors {
  color: #d20f39;
}
.publication .warnings {
  color: #df8e1d;
}
.publication .actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
button.link {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS — 6 PublicationPanel tests and every earlier test.

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): validate, publish, export and withdraw a mission"
```

---

### Task 7: Assign a mission to devices

**Files:**
- Create: `web/src/editor/AssignmentPanel.tsx`
- Modify: `web/src/editor/MissionEditorPage.tsx`
- Test: `web/src/editor/AssignmentPanel.test.tsx`

**Interfaces:**
- Consumes: `listDevices`, `listAssignedDevices`, `assignDevices`, `Device` (Task 2); `formatUtc` (web-1).
- Produces: `AssignmentPanel({ missionId: string, disabled: boolean })` — a checkbox per device (revoked devices disabled and labelled), "Enregistrer l'affectation"; after saving it invalidates `["assigned", missionId]`, `["versions", missionId]` and `["validation", missionId]` (the server rebuilds the current package with the new recipients).

- [ ] **Step 1: Write the failing test**

`web/src/editor/AssignmentPanel.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import type { Device } from "../api/geomap";
import { AssignmentPanel } from "./AssignmentPanel";

const missionId = "11111111-1111-4111-8111-111111111111";
const device = (id: string, name: string, overrides: Partial<Device> = {}): Device => ({
  id,
  name,
  certSha256: id.repeat(64),
  status: "ENROLLED",
  lastContact: "2026-09-28T09:00:00Z",
  createdAt: "2026-09-20T09:00:00Z",
  ...overrides,
});
const alpha = device("a", "Tablette Alpha");
const bravo = device("b", "Tablette Bravo", { lastContact: null });
const charlie = device("c", "Tablette Charlie", { status: "REVOKED" });

function serve(assigned: Device[] = [alpha]) {
  server.use(
    http.get("/api/devices", () => HttpResponse.json([alpha, bravo, charlie])),
    http.get(`/api/missions/${missionId}/devices`, () => HttpResponse.json(assigned)),
  );
}

it("shows every device with its assignment, status and last contact", async () => {
  serve();
  renderWithProviders(<AssignmentPanel missionId={missionId} disabled={false} />);
  expect(await screen.findByLabelText(/Tablette Alpha/)).toBeChecked();
  expect(screen.getByLabelText(/Tablette Bravo/)).not.toBeChecked();
  expect(screen.getByLabelText(/Tablette Charlie — révoqué/)).toBeDisabled();
  expect(screen.getAllByText(/2026-09-28 09:00Z/).length).toBeGreaterThan(0);
  expect(screen.getByText(/jamais/)).toBeInTheDocument();
});

it("saves the new assignment", async () => {
  serve();
  let body: unknown;
  server.use(
    http.put(`/api/missions/${missionId}/devices`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json([alpha, bravo]);
    }),
  );
  renderWithProviders(<AssignmentPanel missionId={missionId} disabled={false} />);
  const user = userEvent.setup();
  await user.click(await screen.findByLabelText(/Tablette Bravo/));
  await user.click(screen.getByRole("button", { name: "Enregistrer l'affectation" }));
  await waitFor(() => expect(body).toEqual({ deviceIds: ["a", "b"] }));
  expect(await screen.findByRole("status")).toHaveTextContent("Affectation enregistrée.");
});

it("shows the server's refusal", async () => {
  serve();
  server.use(
    http.put(`/api/missions/${missionId}/devices`, () =>
      HttpResponse.json({ status: 409, detail: "mission is withdrawn" }, { status: 409 }),
    ),
  );
  renderWithProviders(<AssignmentPanel missionId={missionId} disabled={false} />);
  await userEvent.click(await screen.findByRole("button", { name: "Enregistrer l'affectation" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("mission is withdrawn");
});

it("explains what to do when no device exists", async () => {
  server.use(
    http.get("/api/devices", () => HttpResponse.json([])),
    http.get(`/api/missions/${missionId}/devices`, () => HttpResponse.json([])),
  );
  renderWithProviders(<AssignmentPanel missionId={missionId} disabled={false} />);
  expect(
    await screen.findByText("Aucun terminal enregistré : demandez à un administrateur."),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- src/editor/AssignmentPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./AssignmentPanel"`.

- [ ] **Step 3: Write minimal implementation**

`web/src/editor/AssignmentPanel.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { assignDevices, listAssignedDevices, listDevices } from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc } from "../format";

export function AssignmentPanel({ missionId, disabled }: { missionId: string; disabled: boolean }) {
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ["devices"], queryFn: listDevices });
  const assigned = useQuery({
    queryKey: ["assigned", missionId],
    queryFn: () => listAssignedDevices(missionId),
  });
  // null until the user ticks a box: the server's list is the starting point.
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selection = chosen ?? new Set(assigned.data?.map((d) => d.id) ?? []);

  function toggle(id: string) {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  }

  async function save() {
    setError(null);
    setNotice(null);
    try {
      await assignDevices(missionId, [...selection].sort());
      setChosen(null);
      setNotice("Affectation enregistrée.");
      await Promise.all(
        [["assigned", missionId], ["versions", missionId], ["validation", missionId]].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const loadError = devices.error ?? assigned.error;
  return (
    <section className="assignment">
      <h2>Terminaux affectés</h2>
      {loadError && <p role="alert">{errorMessage(loadError)}</p>}
      {devices.data?.length === 0 && (
        <p>Aucun terminal enregistré : demandez à un administrateur.</p>
      )}
      <ul>
        {devices.data?.map((d) => {
          const revoked = d.status === "REVOKED";
          return (
            <li key={d.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selection.has(d.id)}
                  disabled={disabled || revoked}
                  onChange={() => toggle(d.id)}
                />
                {d.name}
                {revoked && " — révoqué"}
              </label>{" "}
              <small>
                dernier contact : {d.lastContact ? formatUtc(d.lastContact) : "jamais"}
              </small>
            </li>
          );
        })}
      </ul>
      <button disabled={disabled || !devices.data || !assigned.data} onClick={() => void save()}>
        Enregistrer l'affectation
      </button>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
```

`web/src/editor/MissionEditorPage.tsx` — render before the `PublicationPanel` (import `AssignmentPanel`):

```tsx
        <AssignmentPanel missionId={missionId} disabled={current.status === "WITHDRAWN"} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS — 4 AssignmentPanel tests and every earlier test.

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): assign a mission to devices"
```

---

### Task 8: Administration — devices and basemaps

**Files:**
- Create: `web/src/admin/DevicesPage.tsx`, `web/src/admin/BasemapsPage.tsx`, `web/src/Home.tsx`
- Modify: `web/src/App.tsx`, `web/src/Layout.tsx`, `web/src/index.css`
- Test: `web/src/admin/DevicesPage.test.tsx`, `web/src/admin/BasemapsPage.test.tsx`, `web/src/Home.test.tsx`

**Interfaces:**
- Consumes: `listDevices`, `registerDevice`, `revokeDevice`, `listBasemaps`, `uploadBasemap` (Task 2); `useSession`, `RequireRole` (web-1); `renderWithProviders`, `fakeToken`.
- Produces: routes `/admin/terminaux` and `/admin/fonds` (role `administrateur`); `/` renders `Home` — the missions page for planners, a redirect to `/admin/terminaux` for administrators without the planner role, the role refusal otherwise; `Layout` shows only the links the user's roles allow.

- [ ] **Step 1: Write the failing tests**

`web/src/admin/DevicesPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import type { Device } from "../api/geomap";
import { DevicesPage } from "./DevicesPage";

const alpha: Device = {
  id: "a",
  name: "Tablette Alpha",
  certSha256: "ab".repeat(32),
  status: "ENROLLED",
  lastContact: null,
  createdAt: "2026-09-20T09:00:00Z",
};

it("registers a device with its fingerprint and encryption key", async () => {
  server.use(http.get("/api/devices", () => HttpResponse.json([])));
  let body: unknown;
  server.use(
    http.post("/api/devices", async ({ request }) => {
      body = await request.json();
      server.use(http.get("/api/devices", () => HttpResponse.json([alpha])));
      return HttpResponse.json(alpha, { status: 201 });
    }),
  );
  renderWithProviders(<DevicesPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nom"), "Tablette Alpha");
  await user.type(screen.getByLabelText("Empreinte du certificat (SHA-256)"), "ab".repeat(32));
  await user.type(
    screen.getByLabelText("Clé publique de chiffrement (PEM)"),
    "-----BEGIN PUBLIC KEY-----",
  );
  await user.click(screen.getByRole("button", { name: "Enregistrer le terminal" }));
  await waitFor(() =>
    expect(body).toEqual({
      name: "Tablette Alpha",
      certSha256: "ab".repeat(32),
      encryptionPublicKeyPem: "-----BEGIN PUBLIC KEY-----",
    }),
  );
  expect(await screen.findByText("Tablette Alpha")).toBeInTheDocument();
});

it("revokes an enrolled device after confirmation", async () => {
  server.use(http.get("/api/devices", () => HttpResponse.json([alpha])));
  const revoked = vi.fn();
  server.use(
    http.post("/api/devices/a/revoke", () => {
      revoked();
      return HttpResponse.json({ ...alpha, status: "REVOKED" });
    }),
  );
  renderWithProviders(<DevicesPage />);
  const user = userEvent.setup();
  const row = (await screen.findByText("Tablette Alpha")).closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "Révoquer" }));
  expect(revoked).not.toHaveBeenCalled();
  await user.click(within(row).getByRole("button", { name: "Confirmer la révocation" }));
  await waitFor(() => expect(revoked).toHaveBeenCalled());
});

it("shows the server's refusal", async () => {
  server.use(
    http.get("/api/devices", () => HttpResponse.json([])),
    http.post("/api/devices", () =>
      HttpResponse.json(
        { status: 400, detail: "certSha256 must be 64 lowercase hex characters" },
        { status: 400 },
      ),
    ),
  );
  renderWithProviders(<DevicesPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nom"), "x");
  await user.type(screen.getByLabelText("Empreinte du certificat (SHA-256)"), "zz");
  await user.type(screen.getByLabelText("Clé publique de chiffrement (PEM)"), "k");
  await user.click(screen.getByRole("button", { name: "Enregistrer le terminal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "certSha256 must be 64 lowercase hex characters",
  );
});
```

`web/src/admin/BasemapsPage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { basemap } from "../test/fixtures";
import { BasemapsPage } from "./BasemapsPage";

it("lists basemaps with their size in MB", async () => {
  server.use(
    http.get("/api/basemaps", () =>
      HttpResponse.json([basemap({ sizeBytes: 250 * 1024 * 1024 })]),
    ),
  );
  renderWithProviders(<BasemapsPage />);
  expect(await screen.findByText("Zone Nord")).toBeInTheDocument();
  expect(screen.getByText("250 Mo")).toBeInTheDocument();
});

it("uploads a PMTiles file under an id and a name", async () => {
  server.use(http.get("/api/basemaps", () => HttpResponse.json([])));
  let seen: unknown;
  server.use(
    http.put("/api/basemaps/zone-sud", async ({ request }) => {
      seen = {
        name: new URL(request.url).searchParams.get("name"),
        size: (await request.arrayBuffer()).byteLength,
      };
      return HttpResponse.json(basemap({ id: "zone-sud", name: "Zone Sud" }), { status: 201 });
    }),
  );
  renderWithProviders(<BasemapsPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Identifiant"), "zone-sud");
  await user.type(screen.getByLabelText("Nom"), "Zone Sud");
  await user.upload(
    screen.getByLabelText("Fichier PMTiles"),
    new File([new Uint8Array(5)], "zone-sud.pmtiles"),
  );
  await user.click(screen.getByRole("button", { name: "Importer" }));
  await waitFor(() => expect(seen).toEqual({ name: "Zone Sud", size: 5 }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Fond de carte « Zone Sud » importé.",
  );
});

it("shows the server's refusal", async () => {
  server.use(
    http.get("/api/basemaps", () => HttpResponse.json([])),
    http.put("/api/basemaps/zone-nord", () =>
      HttpResponse.json(
        { status: 409, detail: "basemap zone-nord already exists" },
        { status: 409 },
      ),
    ),
  );
  renderWithProviders(<BasemapsPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Identifiant"), "zone-nord");
  await user.type(screen.getByLabelText("Nom"), "Zone Nord");
  await user.upload(
    screen.getByLabelText("Fichier PMTiles"),
    new File([new Uint8Array(1)], "a.pmtiles"),
  );
  await user.click(screen.getByRole("button", { name: "Importer" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("basemap zone-nord already exists");
});
```

`web/src/Home.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { User } from "oidc-client-ts";
import { http, HttpResponse } from "msw";
import { server } from "./test/server";
import { fakeToken } from "./test/tokens";
import { AuthProvider, type AuthManager } from "./auth/AuthProvider";
import { Home } from "./Home";

function renderAs(roles: string[]) {
  const user = {
    access_token: fakeToken({ realm_access: { roles } }),
    expired: false,
    profile: { sub: "u", name: "Utilisateur" },
  } as unknown as User;
  const noop = () => {};
  const manager = {
    getUser: async () => user,
    signinRedirect: async () => {},
    signinRedirectCallback: async () => user,
    signoutRedirect: async () => {},
    events: {
      addUserLoaded: noop,
      removeUserLoaded: noop,
      addSilentRenewError: noop,
      removeSilentRenewError: noop,
    },
  } as unknown as AuthManager;
  const router = createMemoryRouter(
    [
      { path: "/", element: <Home /> },
      { path: "/admin/terminaux", element: <p>page terminaux</p> },
    ],
    { initialEntries: ["/"] },
  );
  render(
    <AuthProvider manager={manager}>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthProvider>,
  );
}

it("sends an administrator without the planner role to the device page", async () => {
  renderAs(["administrateur"]);
  expect(await screen.findByText("page terminaux")).toBeInTheDocument();
});

it("shows planners their missions", async () => {
  server.use(
    http.get("/api/missions", () => HttpResponse.json([])),
    http.get("/api/basemaps", () => HttpResponse.json([])),
  );
  renderAs(["planificateur", "administrateur"]);
  expect(await screen.findByRole("heading", { name: "Missions" })).toBeInTheDocument();
});

it("refuses a user with neither role", async () => {
  renderAs([]);
  expect(await screen.findByRole("alert")).toHaveTextContent("planificateur");
});
```

(If `AuthProvider` registers other `events` methods, add them to the fake as no-ops.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/admin src/Home.test.tsx`
Expected: FAIL — `Failed to resolve import "./DevicesPage"` / `"./BasemapsPage"` / `"./Home"`.

- [ ] **Step 3: Write minimal implementation**

`web/src/admin/DevicesPage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listDevices, registerDevice, revokeDevice } from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc } from "../format";

export function DevicesPage() {
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ["devices"], queryFn: listDevices });
  const [name, setName] = useState("");
  const [certSha256, setCertSha256] = useState("");
  const [pem, setPem] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["devices"] });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await registerDevice({
        name: name.trim(),
        certSha256: certSha256.trim(),
        encryptionPublicKeyPem: pem.trim(),
      });
      setName("");
      setCertSha256("");
      setPem("");
    });
  }

  return (
    <main className="page">
      <h1>Terminaux</h1>
      <p>Enregistrement manuel en attendant l'enrôlement par QR code.</p>
      <form onSubmit={submit} className="admin-form">
        <label>
          Nom
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </label>
        <label>
          Empreinte du certificat (SHA-256)
          <input value={certSha256} onChange={(e) => setCertSha256(e.target.value)} required />
        </label>
        <label>
          Clé publique de chiffrement (PEM)
          <textarea value={pem} onChange={(e) => setPem(e.target.value)} required rows={4} />
        </label>
        <button type="submit">Enregistrer le terminal</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {devices.error && <p role="alert">{errorMessage(devices.error)}</p>}
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Empreinte</th>
            <th>Statut</th>
            <th>Dernier contact</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {devices.data?.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td title={d.certSha256}>{d.certSha256.slice(0, 12)}…</td>
              <td>{d.status === "ENROLLED" ? "Enrôlé" : "Révoqué"}</td>
              <td>{d.lastContact ? formatUtc(d.lastContact) : "jamais"}</td>
              <td>
                {d.status === "ENROLLED" &&
                  (confirming === d.id ? (
                    <>
                      <button
                        onClick={() =>
                          void run(async () => {
                            await revokeDevice(d.id);
                            setConfirming(null);
                          })
                        }
                      >
                        Confirmer la révocation
                      </button>
                      <button onClick={() => setConfirming(null)}>Annuler</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirming(d.id)}>Révoquer</button>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

`web/src/admin/BasemapsPage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listBasemaps, uploadBasemap } from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc } from "../format";

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} Mo`;

export function BasemapsPage() {
  const queryClient = useQueryClient();
  const basemaps = useQuery({ queryKey: ["basemaps"], queryFn: listBasemaps });
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError(null);
    setNotice(null);
    setProgress(0);
    try {
      const saved = await uploadBasemap(id.trim(), name.trim(), file, setProgress);
      setNotice(`Fond de carte « ${saved.name} » importé.`);
      await queryClient.invalidateQueries({ queryKey: ["basemaps"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }

  return (
    <main className="page">
      <h1>Fonds de carte</h1>
      <p>
        Import d'un fichier PMTiles déjà généré ; la génération depuis un extrait OSM arrive avec
        le déploiement.
      </p>
      <form onSubmit={submit} className="admin-form">
        <label>
          Identifiant
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
            pattern="[a-z0-9\-]{1,64}"
            title="lettres minuscules, chiffres et tirets"
          />
        </label>
        <label>
          Nom
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
        </label>
        <label>
          Fichier PMTiles
          <input
            type="file"
            accept=".pmtiles"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" disabled={progress !== null}>
          Importer
        </button>
        {progress !== null && <progress value={progress} max={1} aria-label="Import en cours" />}
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {basemaps.error && <p role="alert">{errorMessage(basemaps.error)}</p>}
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Identifiant</th>
            <th>Taille</th>
            <th>Importé</th>
          </tr>
        </thead>
        <tbody>
          {basemaps.data?.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td>{b.id}</td>
              <td>{megabytes(b.sizeBytes)}</td>
              <td>
                {formatUtc(b.createdAt)} par {b.createdBy}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

`web/src/Home.tsx`:

```tsx
import { Navigate } from "react-router";
import { RequireRole, useSession } from "./auth/AuthProvider";
import { MissionsPage } from "./missions/MissionsPage";

export function Home() {
  const { roles } = useSession();
  if (!roles.includes("planificateur") && roles.includes("administrateur")) {
    return <Navigate to="/admin/terminaux" replace />;
  }
  return (
    <RequireRole role="planificateur">
      <MissionsPage />
    </RequireRole>
  );
}
```

`web/src/App.tsx`:
- the `/` route's element becomes `<Home />` (import from `./Home`; drop the now unused `MissionsPage` import);
- add under the layout's `children` (imports from `./admin/DevicesPage` and `./admin/BasemapsPage`):

```tsx
      {
        path: "/admin/terminaux",
        element: (
          <RequireRole role="administrateur">
            <DevicesPage />
          </RequireRole>
        ),
      },
      {
        path: "/admin/fonds",
        element: (
          <RequireRole role="administrateur">
            <BasemapsPage />
          </RequireRole>
        ),
      },
```

`web/src/Layout.tsx` — take `roles` from `useSession()` and replace the `<nav>` content:

```tsx
        <nav>
          {roles.includes("planificateur") && <Link to="/">Missions</Link>}
          {roles.includes("administrateur") && (
            <>
              <Link to="/admin/terminaux">Terminaux</Link>
              <Link to="/admin/fonds">Fonds de carte</Link>
            </>
          )}
        </nav>
```

`web/src/index.css` — append:

```css
.topbar nav {
  display: flex;
  gap: 1rem;
}
.admin-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 40rem;
}
.admin-form label {
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS — 3 + 3 + 3 new tests and every earlier test.

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`, then `make check` at the repo root.
Expected: all green for `shared`, `server` and `web`.

```bash
git add web
git commit -m "feat(web): administer devices and basemaps"
```

---

### Task 9: End-to-end stack and smoke test

**Files:**
- Create: `web/e2e/compose.yml`, `web/e2e/realm/geomap-realm.json`, `web/e2e/setup-env.mjs`, `web/e2e/.env.e2e.example`, `web/e2e/tsconfig.json`, `web/e2e/helpers.ts`, `web/e2e/smoke.spec.ts`, `web/playwright.config.ts`
- Modify: `web/package.json`, `web/package-lock.json`, `web/vite.config.ts`, `web/.gitignore`, `Makefile`

**Interfaces:**
- Produces: `make e2e` — generates per-machine secrets once (`web/e2e/.env.e2e`, gitignored), starts PostgreSQL, MinIO and Keycloak with Docker Compose, runs Playwright (which starts the server with `bootRun` and the web app with `vite`), then stops the stack and removes its volumes. `helpers.ts`: `env(name)`, `signIn(page, who: "planner" | "admin", path?)`.
- Test users (realm `geomap`): `planificateur-e2e` (role `planificateur`) and `admin-e2e` (role `administrateur`), passwords from `E2E_PLANNER_PASSWORD` / `E2E_ADMIN_PASSWORD`.

- [ ] **Step 1: Write the stack and the smoke test**

`web/e2e/.env.e2e.example` (committed; documents every variable `setup-env.mjs` generates):

```
# Generated by `node e2e/setup-env.mjs` into e2e/.env.e2e (gitignored). Never commit real values.
KC_BOOTSTRAP_ADMIN_USERNAME=
KC_BOOTSTRAP_ADMIN_PASSWORD=
E2E_PLANNER_PASSWORD=
E2E_ADMIN_PASSWORD=
POSTGRES_PASSWORD=
MINIO_ROOT_USER=
MINIO_ROOT_PASSWORD=
GEOMAP_SIGNING_PRIVATE_KEY_PEM=
GEOMAP_SIGNING_PUBLIC_KEY_PEM=
```

`web/e2e/setup-env.mjs`:

```js
// Generates the e2e secrets once per machine; they never leave e2e/.env.e2e (gitignored).
import { existsSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, randomBytes } from "node:crypto";

const file = new URL(".env.e2e", import.meta.url);
if (existsSync(file)) process.exit(0);

const secret = () => randomBytes(18).toString("base64url");
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = (key, type) => key.export({ type, format: "pem" }).trim().replaceAll("\n", "\\n");

const values = {
  KC_BOOTSTRAP_ADMIN_USERNAME: "kcadmin",
  KC_BOOTSTRAP_ADMIN_PASSWORD: secret(),
  E2E_PLANNER_PASSWORD: secret(),
  E2E_ADMIN_PASSWORD: secret(),
  POSTGRES_PASSWORD: secret(),
  MINIO_ROOT_USER: "geomap",
  MINIO_ROOT_PASSWORD: secret(),
  GEOMAP_SIGNING_PRIVATE_KEY_PEM: pem(privateKey, "pkcs8"),
  GEOMAP_SIGNING_PUBLIC_KEY_PEM: pem(publicKey, "spki"),
};
writeFileSync(
  file,
  Object.entries(values)
    .map(([key, value]) => `${key}="${value}"`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
```

`web/e2e/compose.yml` (pin Keycloak to the newest `26.x` tag that `docker pull` finds, and ledger the tag):

```yaml
name: geomap-e2e
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: geomap
      POSTGRES_USER: geomap
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports: ["127.0.0.1:55432:5432"]
    tmpfs: [/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U geomap"]
      interval: 2s
      retries: 30
  minio:
    image: minio/minio:RELEASE.2024-10-13T13-34-11Z
    command: server /data
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    ports: ["127.0.0.1:59000:9000"]
    healthcheck:
      test: ["CMD", "curl", "-fs", "http://localhost:9000/minio/health/live"]
      interval: 2s
      retries: 30
  keycloak:
    image: quay.io/keycloak/keycloak:26.4
    command: ["start-dev", "--import-realm", "--http-port=8180", "--health-enabled=true"]
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: ${KC_BOOTSTRAP_ADMIN_USERNAME}
      KC_BOOTSTRAP_ADMIN_PASSWORD: ${KC_BOOTSTRAP_ADMIN_PASSWORD}
      E2E_PLANNER_PASSWORD: ${E2E_PLANNER_PASSWORD}
      E2E_ADMIN_PASSWORD: ${E2E_ADMIN_PASSWORD}
    volumes: ["./realm:/opt/keycloak/data/import:ro"]
    ports: ["127.0.0.1:8180:8180"]
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "exec 3<>/dev/tcp/127.0.0.1/9000 && printf 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && grep -q UP <&3",
        ]
      interval: 5s
      retries: 40
```

(Keycloak serves `/health/ready` on its management port 9000 inside the container; if the pinned version differs, adjust the healthcheck and ledger it.)

`web/e2e/realm/geomap-realm.json` (Keycloak replaces `${VAR}` placeholders from its environment at import; verify with the pinned version and ledger any change):

```json
{
  "realm": "geomap",
  "enabled": true,
  "roles": {
    "realm": [{ "name": "planificateur" }, { "name": "administrateur" }]
  },
  "clients": [
    {
      "clientId": "geomap-web",
      "publicClient": true,
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": false,
      "redirectUris": ["http://localhost:5173/*"],
      "webOrigins": ["http://localhost:5173"],
      "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "http://localhost:5173/*"
      }
    }
  ],
  "users": [
    {
      "username": "planificateur-e2e",
      "enabled": true,
      "email": "planificateur-e2e@geomap.test",
      "emailVerified": true,
      "firstName": "Paul",
      "lastName": "Planificateur",
      "credentials": [
        { "type": "password", "value": "${E2E_PLANNER_PASSWORD}", "temporary": false }
      ],
      "realmRoles": ["planificateur"]
    },
    {
      "username": "admin-e2e",
      "enabled": true,
      "email": "admin-e2e@geomap.test",
      "emailVerified": true,
      "firstName": "Anne",
      "lastName": "Administratrice",
      "credentials": [{ "type": "password", "value": "${E2E_ADMIN_PASSWORD}", "temporary": false }],
      "realmRoles": ["administrateur"]
    }
  ]
}
```

`web/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

process.loadEnvFile("e2e/.env.e2e");
const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing: run node e2e/setup-env.mjs`);
  return value;
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "./gradlew bootRun",
      cwd: "../server",
      url: "http://localhost:8080/actuator/health",
      timeout: 240_000,
      env: {
        SPRING_DATASOURCE_URL: "jdbc:postgresql://localhost:55432/geomap",
        SPRING_DATASOURCE_USERNAME: "geomap",
        SPRING_DATASOURCE_PASSWORD: env("POSTGRES_PASSWORD"),
        SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI: "http://localhost:8180/realms/geomap",
        GEOMAP_SIGNING_PRIVATE_KEY_PEM: env("GEOMAP_SIGNING_PRIVATE_KEY_PEM"),
        GEOMAP_SIGNING_PUBLIC_KEY_PEM: env("GEOMAP_SIGNING_PUBLIC_KEY_PEM"),
        GEOMAP_STORAGE_ENDPOINT: "http://localhost:59000",
        GEOMAP_STORAGE_ACCESS_KEY: env("MINIO_ROOT_USER"),
        GEOMAP_STORAGE_SECRET_KEY: env("MINIO_ROOT_PASSWORD"),
        GEOMAP_STORAGE_BUCKET: "geomap-e2e",
      },
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      timeout: 60_000,
    },
  ],
});
```

Check that `process.loadEnvFile` turns the `\n` sequences inside double quotes into real newlines (Node's parser does for double-quoted values); if the server rejects the PEM keys, change the encoding in `setup-env.mjs` and ledger it.

`web/e2e/helpers.ts`:

```ts
import { expect, type Page } from "@playwright/test";

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing: run node e2e/setup-env.mjs`);
  return value;
}

const ACCOUNTS = {
  planner: { username: "planificateur-e2e", password: () => env("E2E_PLANNER_PASSWORD") },
  admin: { username: "admin-e2e", password: () => env("E2E_ADMIN_PASSWORD") },
};

export async function signIn(page: Page, who: keyof typeof ACCOUNTS, path = "/"): Promise<void> {
  const account = ACCOUNTS[who];
  await page.goto(path);
  await page.locator("#username").fill(account.username);
  await page.locator("#password").fill(account.password());
  await page.locator("#kc-login").click();
  await expect(page.getByRole("button", { name: "Déconnexion" })).toBeVisible();
}
```

`web/e2e/smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("a planner signs in through Keycloak and sees the missions", async ({ page }) => {
  await signIn(page, "planner");
  await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terminaux" })).toHaveCount(0);
});

test("an administrator lands on the device page", async ({ page }) => {
  await signIn(page, "admin");
  await expect(page.getByRole("heading", { name: "Terminaux" })).toBeVisible();
});
```

`web/e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": [".", "../playwright.config.ts"]
}
```

`web/package.json`:
- add `"@playwright/test": "1.63.0"` to `devDependencies` (then `npm install`, commit the lockfile);
- change `"typecheck"` to `"tsc --noEmit && tsc --noEmit -p e2e"`;
- add `"e2e": "playwright test"`.

`web/vite.config.ts` — in `test`, add `exclude: ["**/node_modules/**", "e2e/**"]`.

`web/.gitignore` — append:

```
e2e/.env.e2e
test-results/
playwright-report/
```

Root `Makefile` — add (recipe lines start with a tab; `e2e` stays out of `check` because it needs Docker and several minutes):

```make
.PHONY: e2e
e2e: web/node_modules
	cd web && node e2e/setup-env.mjs && npx playwright install chromium
	cd web && docker compose --env-file e2e/.env.e2e -f e2e/compose.yml up -d --wait
	cd web && npm run e2e; status=$$?; docker compose --env-file e2e/.env.e2e -f e2e/compose.yml down -v; exit $$status
```

- [ ] **Step 2: Run the smoke test**

Run: `make e2e`
Expected: the stack starts, both smoke tests PASS, the stack is removed afterwards (`docker ps` shows no `geomap-e2e` container). The first run downloads images and Chromium.

If sign-in fails, fix the stack (realm import, redirect URI, issuer, PEM encoding), never the assertions; ledger each fix.

- [ ] **Step 3: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`, then `make check` at the repo root.
Expected: all green (`e2e/**` is linted and typechecked but not run by Vitest).

```bash
git add Makefile web
git commit -m "test(web): end-to-end stack with Keycloak, PostgreSQL and MinIO"
```

---

### Task 10: End-to-end mission journey

**Files:**
- Create: `web/e2e/map.ts`, `web/e2e/journey.spec.ts`

**Interfaces:**
- Consumes: `signIn` (Task 9); every screen of web-1 and web-2.
- Produces: the spec §12 journey — create a mission, draw, add an APP-6D symbol, publish, export — plus the regressions listed after web-1: Delete key in select mode, clicking another object while reshaping, switching basemap while reshaping, a 20 km circle keeping its centre when renamed.
- `map.ts`: `mapPoint(page, fx, fy)` (click at a fraction of the map canvas), `api<T>(page, path)` (GET with the page's access token, to check what the server stored).

- [ ] **Step 1: Write the journey**

`web/e2e/map.ts`:

```ts
import type { Page } from "@playwright/test";

// Positions are fractions of the map canvas, so the journey does not depend on the window size.
export async function mapPoint(page: Page, fx: number, fy: number): Promise<void> {
  const box = (await page.locator("canvas.maplibregl-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

// Reads the API as the signed-in user, to check what the server stored.
export async function api<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (p) => {
    const key = Object.keys(sessionStorage).find((k) => k.startsWith("oidc.user:"))!;
    const token = (JSON.parse(sessionStorage.getItem(key)!) as { access_token: string })
      .access_token;
    const response = await fetch(p, { headers: { Authorization: `Bearer ${token}` } });
    return response.json();
  }, path) as Promise<T>;
}
```

`web/e2e/journey.spec.ts`:

```ts
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { api, mapPoint } from "./map";

test.describe.configure({ mode: "serial" });

const suffix = randomBytes(3).toString("hex");
const missionName = `Op Nord ${suffix}`;

interface StoredFeature {
  id: string;
  geometry: { type: string; coordinates: unknown };
  style: { radiusMeters?: number } | null;
}

async function uploadBasemap(page: Page, id: string, name: string) {
  await page.getByLabel("Identifiant").fill(id);
  await page.getByLabel("Nom").fill(name);
  // The server does not parse PMTiles on upload; the map then shows its "unreadable basemap" alert.
  await page.getByLabel("Fichier PMTiles").setInputFiles({
    name: `${id}.pmtiles`,
    mimeType: "application/octet-stream",
    buffer: randomBytes(4096),
  });
  await page.getByRole("button", { name: "Importer" }).click();
  await expect(page.getByRole("status")).toContainText(name);
}

test("an administrator prepares basemaps and a device", async ({ page }) => {
  await signIn(page, "admin");
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
  await page.getByLabel("Nom").fill(`Tablette ${suffix}`);
  await page.getByLabel("Empreinte du certificat (SHA-256)").fill(randomBytes(32).toString("hex"));
  await page
    .getByLabel("Clé publique de chiffrement (PEM)")
    .fill(publicKey.export({ type: "spki", format: "pem" }).toString());
  await page.getByRole("button", { name: "Enregistrer le terminal" }).click();
  await expect(page.getByText(`Tablette ${suffix}`)).toBeVisible();

  await page.getByRole("link", { name: "Fonds de carte" }).click();
  await uploadBasemap(page, `zone-a-${suffix}`, `Zone A ${suffix}`);
  await uploadBasemap(page, `zone-b-${suffix}`, `Zone B ${suffix}`);
});

test("a planner draws, symbolises, assigns, publishes and exports a mission", async ({ page }) => {
  await signIn(page, "planner");
  await page.getByLabel("Nom").fill(missionName);
  await page.getByLabel("Fond de carte").selectOption({ label: `Zone A ${suffix}` });
  const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);
  await page.getByLabel("Valide jusqu'au (UTC)").fill(nextWeek);
  await page.getByRole("button", { name: "Créer la mission" }).click();
  await page.getByRole("link", { name: missionName }).click();
  await expect(page.getByRole("heading", { name: missionName })).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();

  // Zone: Terra Draw closes a polygon when its first point is clicked again.
  await page.getByRole("button", { name: "Zone" }).click();
  for (const [x, y] of [
    [0.3, 0.3],
    [0.5, 0.3],
    [0.5, 0.5],
    [0.3, 0.5],
    [0.3, 0.3],
  ] as const) {
    await mapPoint(page, x, y);
  }
  await expect(page.getByRole("button", { name: /Sans nom.*Zone/ })).toBeVisible();

  // Line: finished by clicking its last point again.
  await page.getByRole("button", { name: "Ligne" }).click();
  await mapPoint(page, 0.6, 0.6);
  await mapPoint(page, 0.8, 0.7);
  await mapPoint(page, 0.8, 0.7);
  await expect(page.getByRole("button", { name: /Sans nom.*Ligne/ })).toBeVisible();

  // Circle: click the centre, then the edge.
  await page.getByRole("button", { name: "Cercle" }).click();
  await mapPoint(page, 0.7, 0.3);
  await mapPoint(page, 0.8, 0.3);
  await expect(page.getByRole("button", { name: /Sans nom.*Cercle/ })).toBeVisible();

  // APP-6D infantry battalion.
  await page.getByText("Symbole APP-6D").click();
  await page.getByLabel("Rechercher un symbole").fill("infantry");
  await page.getByRole("button", { name: /^Infantry/ }).first().click();
  await page.getByLabel("Échelon").selectOption("16");
  await page.getByLabel("Désignation").fill("1ER RI");
  await page.getByRole("button", { name: "Placer sur la carte" }).click();
  await mapPoint(page, 0.2, 0.7);
  await expect(page.getByRole("button", { name: /APP-6D 10031000161211000000/ })).toBeVisible();

  // Assign the device; the validator then lets the mission through.
  await page.getByLabel(new RegExp(`Tablette ${suffix}`)).check();
  await page.getByRole("button", { name: "Enregistrer l'affectation" }).click();
  await expect(page.getByText("Affectation enregistrée.")).toBeVisible();
  await expect(page.getByText("Aucune erreur bloquante.")).toBeVisible();

  await page.getByRole("button", { name: "Publier la version 1" }).click();
  await expect(page.getByText("Version 1 publiée pour 1 terminal.")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter pour carte SD" }).click();
  const file = await (await download).path();
  expect(readFileSync(file).subarray(0, 4).toString("latin1")).toBe("GMP1");
});

test("reshaping stays safe: Delete key, switching objects and basemap, circle radius", async ({
  page,
}) => {
  await signIn(page, "planner");
  await page.getByRole("link", { name: missionName }).click();
  const missionId = page.url().split("/").pop()!;
  const features = () => api<StoredFeature[]>(page, `/api/missions/${missionId}/features`);
  const before = await features();
  const circle = before.find((f) => f.style?.radiusMeters)!;

  // Delete in select mode must not remove anything, locally or on the server.
  await page.getByRole("button", { name: /Sans nom.*Zone/ }).click();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("button", { name: /Sans nom.*Zone/ })).toBeVisible();
  expect((await features()).length).toBe(before.length);

  // Clicking another object on the map while reshaping selects it.
  await mapPoint(page, 0.2, 0.7);
  await expect(page.getByLabel("Identité")).toBeVisible();

  // Switching basemap while reshaping keeps the editor alive.
  await page.getByRole("button", { name: /Sans nom.*Zone/ }).click();
  await page.getByText("Paramètres").click();
  await page.getByLabel("Fond de carte").selectOption({ label: `Zone B ${suffix}` });
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("heading", { name: missionName })).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();

  // A circle set to 20 km keeps its centre and radius when it is renamed.
  await page.getByRole("button", { name: /Sans nom.*Cercle/ }).click();
  await page.getByLabel("Rayon (m)").fill("20000");
  await page.getByRole("button", { name: "Enregistrer l'objet" }).click();
  await page.getByLabel("Nom de l'objet").fill("Zone de poser");
  await page.getByRole("button", { name: "Enregistrer l'objet" }).click();
  await expect(page.getByRole("button", { name: /Zone de poser.*Cercle/ })).toBeVisible();
  const saved = (await features()).find((f) => f.id === circle.id)!;
  expect(saved.style?.radiusMeters).toBe(20000);
  expect(saved.geometry.coordinates).toEqual(circle.geometry.coordinates);
});
```

Terra Draw's finishing gestures (closing click, double click, circle second click) and MapLibre's canvas selector may differ in the installed versions: adapt the gestures to what the libraries do, never the assertions, and ledger what you changed. If a regression assertion fails, it is a real bug: report DONE_WITH_CONCERNS with the failing step instead of weakening the test.

- [ ] **Step 2: Run the journey**

Run: `make e2e`
Expected: smoke and journey tests PASS; the stack is removed afterwards.

- [ ] **Step 3: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`, then `make check` at the repo root.
Expected: all green.

```bash
git add web
git commit -m "test(web): end-to-end mission journey from drawing to SD export"
```
