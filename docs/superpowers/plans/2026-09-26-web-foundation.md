# Web Foundation and Editor Implementation Plan (plan web-1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the planner a working web editor: sign in through Keycloak, list/create/edit/delete missions, see the mission area on a self-hosted PMTiles basemap with MGRS and lat/lon readout, and draw, reshape and delete generic objects (point, line, zone, circle), including accepting or rejecting AI suggestions.

**Architecture:** A Vite + React single-page app in `web/`, served from the same origin as the server (relative `/api/...` URLs; Vite proxies `/api` in development). OIDC Authorization Code + PKCE with `oidc-client-ts`; the access token lives in one module (`auth/session.ts`) read by the API client and by the PMTiles fetch headers. Server state goes through TanStack Query. The map is MapLibre GL JS with the Protomaps basemap style; glyphs and sprites are committed under `web/public/map-assets`. Terra Draw only holds the object being drawn or reshaped; every saved object is displayed by a plain MapLibre GeoJSON layer built by pure functions. The server gains one endpoint serving a basemap's PMTiles file with HTTP `Range` support.

**Tech Stack:** React 19.3.0, react-router 8.4.0, @tanstack/react-query 5.104.0, maplibre-gl 6.11.2, pmtiles 4.5.0, @protomaps/basemaps 5.7.2, terra-draw 1.35.0 + terra-draw-maplibre-gl-adapter 1.4.1, oidc-client-ts 3.5.0, mgrs 2.2.0, Vite 8.3.1, TypeScript 6.0.3, Vitest 5.0.2 + jsdom 30.1.1 + Testing Library + msw 2.15.0, ESLint 10.11.0 + typescript-eslint 8.70.1, Prettier 3.9.9. Server side: Kotlin 2.2.20, Spring Boot 4.1.0, MinIO client 9.0.3.

**Spec:** `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` (sections 7.3, 8.1, 9)

**Plan series:** 1, 2a, 2b, 2c-1, 2c-2 done (branch `feature/server`) → **web-1 (this plan)** → web-2 (APP-6D picker and rendering, validator, publication, assignment, SD export, withdrawal, administration, Playwright journey) → 2d (enrollment, mTLS sync, PKI) → android → helm.

**Branch:** create `feature/web` from `feature/server` before Task 1.

## Global Constraints

- **No AI attribution in commit messages — no `Co-Authored-By` or "Generated with" line of any kind.** Conventional Commits (`feat(web): …`, `feat(server): …`).
- Everything from the server plans still applies to `server/` (ktlint, RED test first, `./gradlew check`).
- UI text in French; code, identifiers and comments in English. Comments only for a non-obvious *why*.
- Air-gapped: no request to any external host at runtime. Fonts, glyphs, sprites and scripts come from the app's own origin. No CDN import anywhere.
- One build for every command post: runtime settings come from `/config.json` (`oidcAuthority`, `oidcClientId`), never from build-time env variables.
- API calls use relative `/api/...` paths. The access token is never logged and never written to `localStorage` (oidc-client-ts default `sessionStorage` store).
- Roles (Keycloak realm roles in `realm_access.roles`): `planificateur` for missions, `administrateur` for administration (web-2). Web role checks are UX only; the server enforces them.
- Times are shown and entered in UTC (`2026-10-02 06:00Z`); the API exchanges ISO 8601 UTC strings.
- Coordinates: MGRS at 5-digit precision (1 m) formatted `31U DQ 48251 11932`, and lat/lon at 5 decimals formatted `48.85837° N 2.29448° E`.
- Generic object style keys (read by web and, later, Android): `style.color` = `#rrggbb` (default `#1e66f5`), `style.radiusMeters` = circle radius on a `Point`. Pending AI suggestions are drawn in `#df8e1d`, dashed.
- Dependency versions pinned exactly (no `^`/`~`), as listed in Task 2. TypeScript stays on 6.0.x: typescript-eslint does not support TypeScript 7 yet.
- MapLibre cannot render under jsdom (no WebGL): unit tests cover pure functions and components with the map mocked; real map behaviour is covered by the Playwright journey in web-2.
- `make check` at the repo root is the single gate; after Task 2 it runs `shared`, `server` and `web`.

## Review Focus

- A renewed access token must reach both API calls and later PMTiles range requests without reloading the map. (Task 2 test on `tileHeaders`; Task 5 passes the shared `Headers` object to `FetchSource`.)
- A circle must survive draw → save → reload → reshape: Terra Draw polygon ⇄ `Point` + `radiusMeters`, within 1 m. (Tasks 6, 7.)
- A mission without a basemap, or whose basemap cannot be read, must still open in the editor with an explicit message instead of a blank or crashing map. (Tasks 5, 6.)
- Every server refusal (409 published mission, 403, 400 invalid geometry) must reach the user as the ProblemDetail `detail` text, never as a silent no-op. (Tasks 2, 4, 7, 8.)
- `Range` edge cases on the PMTiles endpoint: open-ended range, suffix range, range past the end, several ranges, malformed header, unknown basemap. (Task 1.)

## File Structure

| File | Responsibility |
|---|---|
| `server/src/main/kotlin/geomap/server/storage/ObjectStore.kt` | `getRange` |
| `server/src/main/kotlin/geomap/server/basemap/{BasemapService,BasemapController}.kt` | `get`, `read`, `GET /api/basemaps/{id}/pmtiles` |
| `Makefile`, `.gitignore` | web in the gate |
| `web/package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `index.html` | toolchain |
| `web/public/config.json` | development runtime settings |
| `web/public/map-assets/**` | glyphs, sprites, their source and licences |
| `web/src/main.tsx`, `App.tsx`, `Layout.tsx`, `index.css` | entry, routes, shell |
| `web/src/auth/{session,config,roles}.ts`, `AuthProvider.tsx` | token holder, runtime config, roles, OIDC |
| `web/src/api/{client,geomap}.ts` | fetch core with ProblemDetail errors; typed endpoints |
| `web/src/format.ts` | UTC and status formatting |
| `web/src/missions/{MissionForm,MissionsPage}.tsx` | mission list, create, edit, delete |
| `web/src/map/{style,coordinates,geodesy,missionLayer,drawing,useDrawing}.ts`, `MapView.tsx`, `CoordinateReadout.tsx` | map |
| `web/src/editor/{MissionEditorPage,DrawToolbar,FeaturePanel}.tsx` | editor |
| `web/src/test/{setup,server,fixtures,tokens}.ts`, `render.tsx` | test helpers |

---

### Task 1: Serve basemap PMTiles with HTTP Range

**Files:**
- Modify: `server/src/main/kotlin/geomap/server/storage/ObjectStore.kt`
- Modify: `server/src/main/kotlin/geomap/server/basemap/BasemapService.kt`
- Modify: `server/src/main/kotlin/geomap/server/basemap/BasemapController.kt`
- Test: `server/src/test/kotlin/geomap/server/basemap/BasemapTilesTest.kt`

**Interfaces:**
- Consumes: `BasemapRepository.find(id)`, `ObjectStore` (2c-1), `IntegrationTest` with `mvc`, `planner()`, `admin()`.
- Produces: `GET /api/basemaps/{id}/pmtiles` (roles `planificateur` or `administrateur`). No `Range` → 200 with the whole file. One range (`bytes=a-b`, `bytes=a-`, `bytes=-n`) → 206 with `Content-Range: bytes a-b/size`. Unsatisfiable, malformed or multiple ranges → 416 with `Content-Range: bytes */size`. Always `Accept-Ranges: bytes`, `ETag: "<sha256>"`, `Cache-Control: max-age=86400, private`; body responses have `Content-Type: application/vnd.pmtiles`. Unknown id → 404. `ObjectStore.getRange(key: String, offset: Long, length: Long): InputStream`. `BasemapService.get(id: String): Basemap`, `BasemapService.read(basemap: Basemap, offset: Long, length: Long): InputStream`.

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/basemap/BasemapTilesTest.kt`:

```kotlin
package geomap.server.basemap

import geomap.pkg.Sha256
import geomap.server.IntegrationTest
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import kotlin.random.Random
import kotlin.test.assertContentEquals

class BasemapTilesTest : IntegrationTest() {
    private val tiles = Random(11).nextBytes(200_000)

    @BeforeEach
    fun uploadBasemap() {
        mvc
            .put("/api/basemaps/zone-nord?name=Zone Nord") {
                with(admin())
                contentType = MediaType.APPLICATION_OCTET_STREAM
                content = tiles
            }.andExpect { status { isCreated() } }
    }

    private fun fetch(range: String? = null) =
        mvc.get("/api/basemaps/zone-nord/pmtiles") {
            with(planner())
            range?.let { header("Range", it) }
        }

    @Test
    fun `serves the whole file without a range`() {
        val body =
            fetch()
                .andExpect {
                    status { isOk() }
                    header { string("Accept-Ranges", "bytes") }
                    header { string("ETag", "\"${Sha256.hex(tiles)}\"") }
                    header { string("Content-Type", "application/vnd.pmtiles") }
                    header { longValue("Content-Length", tiles.size.toLong()) }
                }.andReturn()
                .response.contentAsByteArray
        assertContentEquals(tiles, body)
    }

    @Test
    fun `serves the requested byte range`() {
        val body =
            fetch("bytes=0-16383")
                .andExpect {
                    status { isPartialContent() }
                    header { string("Content-Range", "bytes 0-16383/200000") }
                    header { longValue("Content-Length", 16384) }
                }.andReturn()
                .response.contentAsByteArray
        assertContentEquals(tiles.copyOfRange(0, 16384), body)
    }

    @Test
    fun `serves open-ended and suffix ranges`() {
        val tail = fetch("bytes=199990-").andExpect { status { isPartialContent() } }.andReturn().response
        assertContentEquals(tiles.copyOfRange(199_990, 200_000), tail.contentAsByteArray)
        val suffix =
            fetch("bytes=-10")
                .andExpect { header { string("Content-Range", "bytes 199990-199999/200000") } }
                .andReturn()
                .response
        assertContentEquals(tiles.copyOfRange(199_990, 200_000), suffix.contentAsByteArray)
    }

    @Test
    fun `refuses a range past the end, several ranges or a malformed header`() {
        fetch("bytes=200000-200010").andExpect {
            status { isRequestedRangeNotSatisfiable() }
            header { string("Content-Range", "bytes */200000") }
        }
        fetch("bytes=0-1,5-6").andExpect { status { isRequestedRangeNotSatisfiable() } }
        fetch("bytes=abc").andExpect { status { isRequestedRangeNotSatisfiable() } }
    }

    @Test
    fun `an unknown basemap is not found`() {
        mvc.get("/api/basemaps/zone-sud/pmtiles") { with(planner()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `administrators read tiles too and anonymous callers do not`() {
        mvc.get("/api/basemaps/zone-nord/pmtiles") { with(admin()) }.andExpect { status { isOk() } }
        mvc.get("/api/basemaps/zone-nord/pmtiles").andExpect { status { isUnauthorized() } }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ./gradlew test --tests 'geomap.server.basemap.BasemapTilesTest'`
Expected: FAIL — the route does not exist (4xx where 200/206 is expected).

- [ ] **Step 3: Write minimal implementation**

In `ObjectStore.kt`, after `get`:

```kotlin
    fun getRange(
        key: String,
        offset: Long,
        length: Long,
    ): InputStream =
        client.getObject(
            GetObjectArgs
                .builder()
                .bucket(props.bucket)
                .`object`(key)
                .offset(offset)
                .length(length)
                .build(),
        )
```

In `BasemapService.kt`, after `list()` (import `geomap.server.web.NotFoundException` if missing):

```kotlin
    fun get(id: String): Basemap = basemaps.find(id) ?: throw NotFoundException("basemap not found")

    fun read(
        basemap: Basemap,
        offset: Long,
        length: Long,
    ): InputStream = store.getRange(basemap.objectKey, offset, length)
```

In `BasemapController.kt`, add the route (imports: `jakarta.servlet.http.HttpServletResponse`, `org.springframework.http.HttpHeaders`, `org.springframework.http.HttpRange`, `org.springframework.http.HttpStatus`, `org.springframework.web.bind.annotation.GetMapping`, `org.springframework.web.bind.annotation.RequestHeader`):

```kotlin
    // Written straight to the response: MinIO streams the slice, nothing is buffered in memory.
    @GetMapping("/{id}/pmtiles")
    @PreAuthorize("hasAnyRole('planificateur', 'administrateur')")
    fun tiles(
        @PathVariable id: String,
        @RequestHeader(HttpHeaders.RANGE, required = false) range: String?,
        response: HttpServletResponse,
    ) {
        val basemap = service.get(id)
        val size = basemap.sizeBytes
        response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes")
        response.setHeader(HttpHeaders.ETAG, "\"${basemap.sha256}\"")
        // A basemap id can never be re-uploaded, so its bytes never change.
        response.setHeader(HttpHeaders.CACHE_CONTROL, "max-age=86400, private")
        val (start, end) =
            if (range == null) {
                0L to size - 1
            } else {
                satisfiable(range, size) ?: run {
                    response.status = HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE.value()
                    response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes */$size")
                    return
                }
            }
        if (range != null) {
            response.status = HttpStatus.PARTIAL_CONTENT.value()
            response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes $start-$end/$size")
        }
        response.contentType = "application/vnd.pmtiles"
        response.setContentLengthLong(end - start + 1)
        service.read(basemap, start, end - start + 1).use { it.transferTo(response.outputStream) }
    }

    private fun satisfiable(
        header: String,
        size: Long,
    ): Pair<Long, Long>? =
        try {
            HttpRange.parseRanges(header).singleOrNull()?.let { it.getRangeStart(size) to it.getRangeEnd(size) }
        } catch (e: IllegalArgumentException) {
            null
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && ./gradlew test --tests 'geomap.server.basemap.*'`
Expected: PASS (6 new tests and the existing `BasemapApiTest`).

- [ ] **Step 5: Run the server gate and commit**

Run: `cd server && ./gradlew check`
Expected: BUILD SUCCESSFUL.

```bash
git add server/src/main/kotlin/geomap/server/storage/ObjectStore.kt server/src/main/kotlin/geomap/server/basemap server/src/test/kotlin/geomap/server/basemap/BasemapTilesTest.kt
git commit -m "feat(server): serve basemap PMTiles with HTTP range requests"
```

---

### Task 2: Web toolchain, session holder and API client

**Files:**
- Create: `web/package.json`, `web/package-lock.json` (generated), `web/tsconfig.json`, `web/vite.config.ts`, `web/eslint.config.js`, `web/.prettierrc.json`, `web/.prettierignore`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css`
- Create: `web/src/auth/session.ts`, `web/src/api/client.ts`, `web/src/api/geomap.ts`
- Create: `web/src/test/setup.ts`, `web/src/test/server.ts`
- Test: `web/src/api/client.test.ts`
- Modify: `Makefile`, `.gitignore`

**Interfaces:**
- Consumes: the server REST API (plans 2a–2c-2 and Task 1).
- Produces:
  - `auth/session.ts`: `tileHeaders: Headers`, `setAccessToken(token: string | null): void`, `getAccessToken(): string | null`, `onUnauthorized(handler: () => void): void`, `notifyUnauthorized(): void`.
  - `api/client.ts`: `class ApiError extends Error { status: number }`, `api<T>(path: string, init?: Omit<RequestInit, "body"> & { json?: unknown }): Promise<T>` (bearer token, JSON body, 204 → `undefined`, error → `ApiError` carrying the ProblemDetail `detail`, 401 → `notifyUnauthorized()`), `errorMessage(error: unknown): string`.
  - `api/geomap.ts`: types `Geometry`, `MissionStatus`, `FeatureKind`, `FeatureOrigin`, `SuggestionStatus`, `Mission`, `MissionInput`, `MissionPatch`, `BBox`, `FeatureStyle`, `Feature`, `FeatureInput`, `Basemap`; functions `listMissions`, `getMission`, `createMission`, `updateMission`, `deleteMission`, `listFeatures`, `createFeature`, `updateFeature`, `deleteFeature`, `acceptFeature`, `rejectFeature`, `listBasemaps`, `basemapTilesUrl(id)`.
  - `test/server.ts`: `server` (msw `setupServer()`, started in `setup.ts` with `onUnhandledRequest: "error"`).
  - npm scripts `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `check`.

- [ ] **Step 1: Create the toolchain files**

`web/package.json`:

```json
{
  "name": "geomap-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --check .",
    "test": "vitest run",
    "check": "npm run lint && npm run format && npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {
    "@protomaps/basemaps": "5.7.2",
    "@tanstack/react-query": "5.104.0",
    "maplibre-gl": "6.11.2",
    "mgrs": "2.2.0",
    "oidc-client-ts": "3.5.0",
    "pmtiles": "4.5.0",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "react-router": "8.4.0",
    "terra-draw": "1.35.0",
    "terra-draw-maplibre-gl-adapter": "1.4.1"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@testing-library/dom": "10.4.2",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/geojson": "7946.0.16",
    "@types/node": "24.19.0",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.1",
    "eslint": "10.11.0",
    "eslint-plugin-react-hooks": "7.1.1",
    "globals": "17.12.0",
    "jsdom": "30.1.1",
    "msw": "2.15.0",
    "prettier": "3.9.9",
    "typescript": "6.0.3",
    "typescript-eslint": "8.70.1",
    "vite": "8.3.1",
    "vitest": "5.0.2"
  }
}
```

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom", "node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

(`node` types are needed by `style.test.ts` in Task 5, which reads `node:fs`.)

`web/vite.config.ts` (`defineConfig` must come from `vitest/config` so the `test` key type-checks):

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8080" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

`web/eslint.config.js`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "public"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    rules: { ...reactHooks.configs.recommended.rules },
  },
);
```

`web/.prettierrc.json`:

```json
{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 100 }
```

`web/.prettierignore`:

```
dist
node_modules
public/map-assets
package-lock.json
```

`web/index.html`:

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>geoMap</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/App.tsx` (replaced in Tasks 3 and 4):

```tsx
export function App() {
  return <h1>geoMap</h1>;
}
```

`web/src/main.tsx` (replaced in Task 3):

```tsx
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
```

`web/src/index.css`:

```css
* {
  box-sizing: border-box;
}
html,
body,
#root {
  height: 100%;
  margin: 0;
  font-family: system-ui, sans-serif;
}
[role="alert"] {
  color: #d20f39;
}
```

`web/src/test/server.ts`:

```ts
import { setupServer } from "msw/node";

export const server = setupServer();
```

`web/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { server } from "./server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

Root `.gitignore` — append:

```
node_modules/
web/dist/
```

Root `Makefile` — replace with (recipe lines start with a tab):

```make
.PHONY: check
check: web/node_modules
	cd shared && ./gradlew check
	cd server && ./gradlew check
	cd web && npm run check

web/node_modules: web/package-lock.json
	cd web && npm ci
	touch web/node_modules
```

Run: `cd web && npm install`
Expected: exit 0 and a new `package-lock.json`. An `EBADENGINE` warning for vitest/jsdom on Node 25 is expected and harmless. If npm stops with `ERESOLVE`, add `legacy-peer-deps=true` to `web/.npmrc`, re-run, and ledger it.

- [ ] **Step 2: Write the failing test**

`web/src/api/client.test.ts`:

```ts
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { api, ApiError } from "./client";
import { onUnauthorized, setAccessToken, tileHeaders } from "../auth/session";

afterEach(() => {
  setAccessToken(null);
  onUnauthorized(() => {});
});

it("sends the bearer token and a JSON body", async () => {
  let seen: unknown;
  server.use(
    http.post("/api/things", async ({ request }) => {
      seen = {
        auth: request.headers.get("Authorization"),
        type: request.headers.get("Content-Type"),
        body: await request.json(),
      };
      return HttpResponse.json({ id: 1 }, { status: 201 });
    }),
  );
  setAccessToken("token-1");
  const result = await api<{ id: number }>("/api/things", { method: "POST", json: { name: "a" } });
  expect(result).toEqual({ id: 1 });
  expect(seen).toEqual({ auth: "Bearer token-1", type: "application/json", body: { name: "a" } });
});

it("returns undefined for 204 No Content", async () => {
  server.use(http.delete("/api/things/1", () => new HttpResponse(null, { status: 204 })));
  await expect(api("/api/things/1", { method: "DELETE" })).resolves.toBeUndefined();
});

it("turns a ProblemDetail into an ApiError carrying its detail", async () => {
  server.use(
    http.delete("/api/missions/1", () =>
      HttpResponse.json(
        {
          title: "Conflict",
          status: 409,
          detail: "a published mission cannot be deleted; withdraw it instead",
        },
        { status: 409 },
      ),
    ),
  );
  const error = await api("/api/missions/1", { method: "DELETE" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 409,
    message: "a published mission cannot be deleted; withdraw it instead",
  });
});

it("falls back to the status when the error body is not JSON", async () => {
  server.use(http.get("/api/things", () => new HttpResponse("Bad Gateway", { status: 502 })));
  await expect(api("/api/things")).rejects.toMatchObject({ status: 502, message: "HTTP 502" });
});

it("reports a 401 to the unauthorized handler", async () => {
  const handler = vi.fn();
  onUnauthorized(handler);
  server.use(http.get("/api/things", () => new HttpResponse(null, { status: 401 })));
  await expect(api("/api/things")).rejects.toMatchObject({ status: 401 });
  expect(handler).toHaveBeenCalledOnce();
});

it("keeps the tile headers in step with the current token", () => {
  setAccessToken("token-2");
  expect(tileHeaders.get("Authorization")).toBe("Bearer token-2");
  setAccessToken(null);
  expect(tileHeaders.has("Authorization")).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npm test -- src/api/client.test.ts`
Expected: FAIL — `Failed to resolve import "./client"`.

- [ ] **Step 4: Write minimal implementation**

`web/src/auth/session.ts`:

```ts
let accessToken: string | null = null;
let unauthorizedHandler: () => void = () => {};

// pmtiles copies these headers on every range request, so updating them here also refreshes tile requests.
export const tileHeaders = new Headers();

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) tileHeaders.set("Authorization", `Bearer ${token}`);
  else tileHeaders.delete("Authorization");
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized(): void {
  unauthorizedHandler();
}
```

`web/src/api/client.ts`:

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

export async function api<T>(path: string, { json, headers, ...init }: ApiInit = {}): Promise<T> {
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
  if (!response.ok) throw new ApiError(response.status, await problemDetail(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function problemDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown; title?: unknown };
    if (typeof body.detail === "string" && body.detail) return body.detail;
    if (typeof body.title === "string" && body.title) return body.title;
  } catch {
    // Not a ProblemDetail (proxy error page, empty body): the status line is all we have.
  }
  return `HTTP ${response.status}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

`web/src/api/geomap.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npm test -- src/api/client.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`, then `make check` at the repo root.
Expected: lint, format, typecheck, tests and build pass; `make check` is green for `shared`, `server` and `web`.

```bash
git add Makefile .gitignore web
git commit -m "feat(web): scaffold the React app with a typed API client"
```

---

### Task 3: Keycloak sign-in (OIDC + PKCE) and roles

**Files:**
- Create: `web/public/config.json`, `web/src/auth/config.ts`, `web/src/auth/roles.ts`, `web/src/auth/AuthProvider.tsx`, `web/src/test/tokens.ts`
- Modify: `web/src/main.tsx`, `web/src/App.tsx`
- Test: `web/src/auth/roles.test.ts`, `web/src/auth/AuthProvider.test.tsx`

**Interfaces:**
- Consumes: `setAccessToken`, `onUnauthorized`, `notifyUnauthorized`, `getAccessToken` (Task 2).
- Produces:
  - `auth/config.ts`: `interface AppConfig { oidcAuthority: string; oidcClientId: string }`, `loadConfig(): Promise<AppConfig>`.
  - `auth/roles.ts`: `type Role = "planificateur" | "administrateur"`, `rolesOf(accessToken: string): Role[]`.
  - `auth/AuthProvider.tsx`: `type AuthManager = Pick<UserManager, "getUser" | "signinRedirect" | "signinRedirectCallback" | "signoutRedirect" | "events">`, `CALLBACK_PATH = "/callback"`, `AuthProvider({ manager, children })`, `useSession(): { name: string; roles: Role[]; signOut(): void }`, `RequireRole({ role, children })`.
  - `test/tokens.ts`: `fakeToken(claims: object): string`.

- [ ] **Step 1: Write the failing tests**

`web/src/test/tokens.ts`:

```ts
// Unsigned JWT-shaped string: the web app only decodes claims, the server verifies signatures.
export function fakeToken(claims: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  const base64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${base64}.signature`;
}
```

`web/src/auth/roles.test.ts`:

```ts
import { fakeToken } from "../test/tokens";
import { rolesOf } from "./roles";

it("keeps the geoMap realm roles only", () => {
  const token = fakeToken({ realm_access: { roles: ["offline_access", "planificateur"] } });
  expect(rolesOf(token)).toEqual(["planificateur"]);
});

it("decodes claims containing non-ASCII text", () => {
  const token = fakeToken({ name: "Général Émile", realm_access: { roles: ["administrateur"] } });
  expect(rolesOf(token)).toEqual(["administrateur"]);
});

it("returns no role for a token without realm roles or a malformed token", () => {
  expect(rolesOf(fakeToken({ sub: "u1" }))).toEqual([]);
  expect(rolesOf("not-a-jwt")).toEqual([]);
});
```

`web/src/auth/AuthProvider.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Mock } from "vitest";
import type { User } from "oidc-client-ts";
import { fakeToken } from "../test/tokens";
import { AuthProvider, RequireRole, useSession, type AuthManager } from "./AuthProvider";
import { getAccessToken, notifyUnauthorized, setAccessToken } from "./session";

const token = fakeToken({ realm_access: { roles: ["planificateur"] } });
const alice = {
  access_token: token,
  expired: false,
  profile: { sub: "u1", name: "Alice Martin" },
  state: undefined,
} as unknown as User;

type FakeManager = AuthManager & {
  signinRedirect: Mock;
  signinRedirectCallback: Mock;
  signoutRedirect: Mock;
};

function fakeManager(user: User | null, callbackUser: User = alice): FakeManager {
  return {
    getUser: vi.fn(async () => user),
    signinRedirect: vi.fn(async () => {}),
    signinRedirectCallback: vi.fn(async () => callbackUser),
    signoutRedirect: vi.fn(async () => {}),
    events: { addUserLoaded: vi.fn(), removeUserLoaded: vi.fn() },
  } as unknown as FakeManager;
}

function Whoami() {
  const { name, signOut } = useSession();
  return <button onClick={signOut}>{name}</button>;
}

afterEach(() => {
  setAccessToken(null);
  history.replaceState(null, "", "/");
});

it("sends an anonymous visitor to Keycloak and remembers the page", async () => {
  history.replaceState(null, "", "/missions/42?tab=objets");
  const manager = fakeManager(null);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(manager.signinRedirect).toHaveBeenCalledWith({
      state: { returnTo: "/missions/42?tab=objets" },
    }),
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("sends a visitor with an expired session to Keycloak", async () => {
  const manager = fakeManager({ ...alice, expired: true } as User);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await waitFor(() => expect(manager.signinRedirect).toHaveBeenCalled());
});

it("renders the app for a signed-in user and shares the token", async () => {
  const manager = fakeManager(alice);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await userEvent.click(await screen.findByRole("button", { name: "Alice Martin" }));
  expect(getAccessToken()).toBe(token);
  expect(manager.signoutRedirect).toHaveBeenCalled();
});

it("completes the Keycloak callback and returns to the remembered page", async () => {
  history.replaceState(null, "", "/callback?code=abc&state=xyz");
  const manager = fakeManager(null, { ...alice, state: { returnTo: "/missions/42" } } as User);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await screen.findByRole("button", { name: "Alice Martin" });
  expect(manager.signinRedirectCallback).toHaveBeenCalled();
  expect(location.pathname).toBe("/missions/42");
});

it("never returns to another site after the callback", async () => {
  history.replaceState(null, "", "/callback?code=abc&state=xyz");
  const manager = fakeManager(null, { ...alice, state: { returnTo: "//evil.example/x" } } as User);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await screen.findByRole("button", { name: "Alice Martin" });
  expect(location.pathname).toBe("/");
});

it("signs in again when the API answers 401", async () => {
  const manager = fakeManager(alice);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await screen.findByRole("button", { name: "Alice Martin" });
  notifyUnauthorized();
  expect(manager.signinRedirect).toHaveBeenCalled();
});

it("shows a sign-in failure instead of a blank page", async () => {
  history.replaceState(null, "", "/callback?error=access_denied");
  const manager = fakeManager(null);
  manager.signinRedirectCallback.mockRejectedValue(new Error("access_denied"));
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("access_denied");
});

it("guards pages by role", async () => {
  render(
    <AuthProvider manager={fakeManager(alice)}>
      <RequireRole role="planificateur">
        <p>missions</p>
      </RequireRole>
      <RequireRole role="administrateur">
        <p>terminaux</p>
      </RequireRole>
    </AuthProvider>,
  );
  expect(await screen.findByText("missions")).toBeInTheDocument();
  expect(screen.queryByText("terminaux")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("administrateur");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/auth`
Expected: FAIL — `Failed to resolve import "./roles"` / `"./AuthProvider"`.

- [ ] **Step 3: Write minimal implementation**

`web/public/config.json` (development defaults; each command post's deployment overrides this file):

```json
{
  "oidcAuthority": "http://localhost:8180/realms/geomap",
  "oidcClientId": "geomap-web"
}
```

`web/src/auth/config.ts`:

```ts
export interface AppConfig {
  oidcAuthority: string;
  oidcClientId: string;
}

// Read at startup, not baked in at build time: the same build runs at every command post.
export async function loadConfig(): Promise<AppConfig> {
  const response = await fetch("/config.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`cannot load /config.json (HTTP ${response.status})`);
  const config = (await response.json()) as Partial<AppConfig>;
  if (!config.oidcAuthority || !config.oidcClientId) {
    throw new Error("/config.json must define oidcAuthority and oidcClientId");
  }
  return { oidcAuthority: config.oidcAuthority, oidcClientId: config.oidcClientId };
}
```

`web/src/auth/roles.ts`:

```ts
export type Role = "planificateur" | "administrateur";

const KNOWN_ROLES: readonly Role[] = ["planificateur", "administrateur"];

export function rolesOf(accessToken: string): Role[] {
  try {
    const payload = accessToken.split(".")[1] ?? "";
    const base64 = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as {
      realm_access?: { roles?: unknown };
    };
    const roles = claims.realm_access?.roles;
    return Array.isArray(roles) ? KNOWN_ROLES.filter((role) => roles.includes(role)) : [];
  } catch {
    return [];
  }
}
```

`web/src/auth/AuthProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User, UserManager } from "oidc-client-ts";
import { rolesOf, type Role } from "./roles";
import { onUnauthorized, setAccessToken } from "./session";

export type AuthManager = Pick<
  UserManager,
  "getUser" | "signinRedirect" | "signinRedirectCallback" | "signoutRedirect" | "events"
>;

export interface Session {
  name: string;
  roles: Role[];
  signOut: () => void;
}

export const CALLBACK_PATH = "/callback";

const SessionContext = createContext<Session | null>(null);

function safeReturnPath(state: unknown): string {
  const returnTo = (state as { returnTo?: unknown } | undefined)?.returnTo;
  // "//host" is a protocol-relative URL to another site.
  return typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/";
}

export function AuthProvider({ manager, children }: { manager: AuthManager; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const signIn = () =>
      void manager.signinRedirect({ state: { returnTo: location.pathname + location.search } });
    const loaded = (next: User) => {
      setAccessToken(next.access_token);
      setUser(next);
    };
    onUnauthorized(signIn);
    manager.events.addUserLoaded(loaded);
    (async () => {
      if (location.pathname === CALLBACK_PATH) {
        const signedIn = await manager.signinRedirectCallback();
        history.replaceState(null, "", safeReturnPath(signedIn.state));
        loaded(signedIn);
        return;
      }
      const current = await manager.getUser();
      if (current && !current.expired) loaded(current);
      else signIn();
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => manager.events.removeUserLoaded(loaded);
  }, [manager]);

  if (error) return <p role="alert">Connexion impossible : {error}</p>;
  if (!user) return <p>Connexion…</p>;
  const session: Session = {
    name: user.profile.name ?? user.profile.preferred_username ?? user.profile.sub,
    roles: rolesOf(user.access_token),
    signOut: () => void manager.signoutRedirect(),
  };
  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside AuthProvider");
  return session;
}

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { roles } = useSession();
  if (!roles.includes(role)) return <p role="alert">Accès réservé au rôle {role}.</p>;
  return children;
}
```

`web/src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { UserManager } from "oidc-client-ts";
import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";
import { loadConfig } from "./auth/config";
import { AuthProvider, CALLBACK_PATH } from "./auth/AuthProvider";
import { App } from "./App";

const root = createRoot(document.getElementById("root")!);

// No StrictMode: its double effect run would redeem the one-time authorization code twice.
loadConfig().then(
  (config) => {
    const manager = new UserManager({
      authority: config.oidcAuthority,
      client_id: config.oidcClientId,
      redirect_uri: location.origin + CALLBACK_PATH,
      post_logout_redirect_uri: location.origin + "/",
      response_type: "code",
      scope: "openid profile",
      automaticSilentRenew: true,
    });
    root.render(
      <AuthProvider manager={manager}>
        <App />
      </AuthProvider>,
    );
  },
  (error: unknown) => root.render(<p role="alert">{String(error)}</p>),
);
```

`web/src/App.tsx` (replaced in Task 4):

```tsx
import { useSession } from "./auth/AuthProvider";

export function App() {
  const { name, signOut } = useSession();
  return (
    <header>
      <strong>geoMap</strong> {name} <button onClick={signOut}>Déconnexion</button>
    </header>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test -- src/auth`
Expected: PASS (3 + 8 tests).

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): sign in with Keycloak using OIDC and PKCE"
```

---

### Task 4: App shell and missions page

**Files:**
- Create: `web/src/Layout.tsx`, `web/src/format.ts`, `web/src/missions/MissionForm.tsx`, `web/src/missions/MissionsPage.tsx`, `web/src/test/render.tsx`, `web/src/test/fixtures.ts`
- Modify: `web/src/App.tsx`, `web/src/index.css`
- Test: `web/src/format.test.ts`, `web/src/missions/MissionsPage.test.tsx`

**Interfaces:**
- Consumes: `useSession`, `RequireRole` (Task 3); `listMissions`, `createMission`, `deleteMission`, `listBasemaps`, `errorMessage`, types (Task 2).
- Produces:
  - `format.ts`: `STATUS_LABELS: Record<MissionStatus, string>`, `formatUtc(iso: string | null): string`, `toUtcInput(iso: string | null): string`, `fromUtcInput(value: string): string | null`.
  - `missions/MissionForm.tsx`: `MissionForm({ initial?: Mission, submitLabel: string, onSubmit(input: MissionInput): Promise<unknown> })` with fields labelled `Nom`, `Fond de carte`, `Valide jusqu'au (UTC)`.
  - `App.tsx`: routes under `Layout`; `/` → missions behind `planificateur`. Task 6 adds `/missions/:missionId`.
  - `test/render.tsx`: `renderWithProviders(ui, { route?, path? })` → Testing Library result plus `queryClient` and `router`.
  - `test/fixtures.ts`: `mission(overrides?)`, `feature(overrides?)`, `basemap(overrides?)`.

- [ ] **Step 1: Write the failing tests**

`web/src/test/fixtures.ts`:

```ts
import type { Basemap, Feature, Mission } from "../api/geomap";

export function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Op Nord",
    status: "DRAFT",
    basemapId: "zone-nord",
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
    sizeBytes: 1000,
    sha256: "a".repeat(64),
    createdBy: "admin",
    createdAt: "2026-09-25T08:00:00Z",
    ...overrides,
  };
}
```

`web/src/test/render.tsx`:

```tsx
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";

export function renderWithProviders(ui: ReactElement, { route = "/", path = "/" } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path, element: ui },
      { path: "*", element: <p>autre page</p> },
    ],
    { initialEntries: [route] },
  );
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, queryClient, router };
}
```

`web/src/format.test.ts`:

```ts
import { formatUtc, fromUtcInput, toUtcInput } from "./format";

it("shows UTC times in Zulu notation", () => {
  expect(formatUtc("2026-10-02T06:00:00Z")).toBe("2026-10-02 06:00Z");
  expect(formatUtc("2026-10-02T06:00:00.123456Z")).toBe("2026-10-02 06:00Z");
  expect(formatUtc(null)).toBe("—");
});

it("round-trips a datetime-local value as UTC", () => {
  expect(fromUtcInput("2026-10-02T06:00")).toBe("2026-10-02T06:00:00Z");
  expect(toUtcInput("2026-10-02T06:00:00Z")).toBe("2026-10-02T06:00");
  expect(fromUtcInput("")).toBeNull();
  expect(toUtcInput(null)).toBe("");
});
```

`web/src/missions/MissionsPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { basemap, mission } from "../test/fixtures";
import { MissionsPage } from "./MissionsPage";

function serve(missions = [mission(), mission({ id: "m2", name: "Op Sud", status: "PUBLISHED" })]) {
  server.use(
    http.get("/api/missions", () => HttpResponse.json(missions)),
    http.get("/api/basemaps", () => HttpResponse.json([basemap()])),
  );
}

const rowOf = async (name: string) => (await screen.findByRole("link", { name })).closest("tr")!;

it("lists missions with their status and UTC dates", async () => {
  serve();
  renderWithProviders(<MissionsPage />);
  const row = await rowOf("Op Nord");
  expect(within(row).getByText("Brouillon")).toBeInTheDocument();
  expect(within(row).getByText("2026-10-02 06:00Z")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Op Nord" })).toHaveAttribute(
    "href",
    "/missions/11111111-1111-4111-8111-111111111111",
  );
  expect(screen.getByText("Publiée")).toBeInTheDocument();
});

it("creates a mission with a basemap and a UTC expiry", async () => {
  serve([]);
  let body: unknown;
  server.use(
    http.post("/api/missions", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(mission(), { status: 201 });
    }),
  );
  renderWithProviders(<MissionsPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nom"), "  Op Nord ");
  await screen.findByRole("option", { name: "Zone Nord" });
  await user.selectOptions(screen.getByLabelText("Fond de carte"), "zone-nord");
  await user.type(screen.getByLabelText("Valide jusqu'au (UTC)"), "2026-10-02T06:00");
  serve();
  await user.click(screen.getByRole("button", { name: "Créer la mission" }));
  await waitFor(() =>
    expect(body).toEqual({
      name: "Op Nord",
      basemapId: "zone-nord",
      validUntil: "2026-10-02T06:00:00Z",
    }),
  );
  expect(await screen.findByRole("link", { name: "Op Nord" })).toBeInTheDocument();
});

it("deletes a draft only after confirmation", async () => {
  serve();
  const deleted = vi.fn();
  server.use(
    http.delete("/api/missions/:id", ({ params }) => {
      deleted(params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderWithProviders(<MissionsPage />);
  const user = userEvent.setup();
  const draftRow = await rowOf("Op Nord");
  const publishedRow = await rowOf("Op Sud");
  expect(within(publishedRow).queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
  await user.click(within(draftRow).getByRole("button", { name: "Supprimer" }));
  expect(deleted).not.toHaveBeenCalled();
  await user.click(within(draftRow).getByRole("button", { name: "Confirmer la suppression" }));
  await waitFor(() => expect(deleted).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111"));
});

it("shows the server's reason when a deletion is refused", async () => {
  serve();
  server.use(
    http.delete("/api/missions/:id", () =>
      HttpResponse.json(
        { status: 409, detail: "a published mission cannot be deleted; withdraw it instead" },
        { status: 409 },
      ),
    ),
  );
  renderWithProviders(<MissionsPage />);
  const user = userEvent.setup();
  const row = await rowOf("Op Nord");
  await user.click(within(row).getByRole("button", { name: "Supprimer" }));
  await user.click(within(row).getByRole("button", { name: "Confirmer la suppression" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "a published mission cannot be deleted; withdraw it instead",
  );
});

it("shows the server's reason when a creation is refused", async () => {
  serve([]);
  server.use(
    http.post("/api/missions", () =>
      HttpResponse.json({ status: 400, detail: "name must not be blank" }, { status: 400 }),
    ),
  );
  renderWithProviders(<MissionsPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nom"), "x");
  await user.click(screen.getByRole("button", { name: "Créer la mission" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("name must not be blank");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/format.test.ts src/missions`
Expected: FAIL — `Failed to resolve import "./format"` / `"./MissionsPage"`.

- [ ] **Step 3: Write minimal implementation**

`web/src/format.ts`:

```ts
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
```

`web/src/missions/MissionForm.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { listBasemaps, type Mission, type MissionInput } from "../api/geomap";
import { errorMessage } from "../api/client";
import { fromUtcInput, toUtcInput } from "../format";

interface Props {
  initial?: Mission;
  submitLabel: string;
  onSubmit: (input: MissionInput) => Promise<unknown>;
}

export function MissionForm({ initial, submitLabel, onSubmit }: Props) {
  const basemaps = useQuery({ queryKey: ["basemaps"], queryFn: listBasemaps });
  const [name, setName] = useState(initial?.name ?? "");
  const [basemapId, setBasemapId] = useState(initial?.basemapId ?? "");
  const [validUntil, setValidUntil] = useState(toUtcInput(initial?.validUntil ?? null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        basemapId: basemapId || null,
        validUntil: fromUtcInput(validUntil),
      });
      if (!initial) {
        setName("");
        setValidUntil("");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mission-form">
      <label>
        Nom
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
      </label>
      <label>
        Fond de carte
        <select value={basemapId} onChange={(e) => setBasemapId(e.target.value)}>
          <option value="">— aucun —</option>
          {basemaps.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Valide jusqu'au (UTC)
        <input
          type="datetime-local"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />
      </label>
      <button type="submit" disabled={busy}>
        {submitLabel}
      </button>
      {basemaps.error && <p role="alert">{errorMessage(basemaps.error)}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

`web/src/missions/MissionsPage.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createMission, deleteMission, listMissions } from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc, STATUS_LABELS } from "../format";
import { MissionForm } from "./MissionForm";

export function MissionsPage() {
  const queryClient = useQueryClient();
  const missions = useQuery({ queryKey: ["missions"], queryFn: listMissions });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["missions"] });

  async function remove(id: string) {
    setError(null);
    try {
      await deleteMission(id);
      setConfirming(null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <main className="page">
      <h1>Missions</h1>
      <MissionForm
        submitLabel="Créer la mission"
        onSubmit={async (input) => {
          await createMission(input);
          await refresh();
        }}
      />
      {missions.isPending && <p>Chargement…</p>}
      {missions.error && <p role="alert">{errorMessage(missions.error)}</p>}
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Statut</th>
            <th>Valide jusqu'au</th>
            <th>Modifiée</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {missions.data?.map((m) => (
            <tr key={m.id}>
              <td>
                <Link to={`/missions/${m.id}`}>{m.name}</Link>
              </td>
              <td>{STATUS_LABELS[m.status]}</td>
              <td>{formatUtc(m.validUntil)}</td>
              <td>
                {formatUtc(m.updatedAt)} par {m.updatedBy}
              </td>
              <td>
                {m.status === "DRAFT" &&
                  (confirming === m.id ? (
                    <>
                      <button onClick={() => void remove(m.id)}>Confirmer la suppression</button>
                      <button onClick={() => setConfirming(null)}>Annuler</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirming(m.id)}>Supprimer</button>
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

`web/src/Layout.tsx`:

```tsx
import { Link, Outlet } from "react-router";
import { useSession } from "./auth/AuthProvider";

export function Layout() {
  const { name, signOut } = useSession();
  return (
    <div className="shell">
      <header className="topbar">
        <strong>geoMap</strong>
        <nav>
          <Link to="/">Missions</Link>
        </nav>
        <span className="user">{name}</span>
        <button onClick={signOut}>Déconnexion</button>
      </header>
      <Outlet />
    </div>
  );
}
```

`web/src/App.tsx`:

```tsx
import { useMemo } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequireRole } from "./auth/AuthProvider";
import { Layout } from "./Layout";
import { MissionsPage } from "./missions/MissionsPage";

const queryClient = new QueryClient();

export function App() {
  // Created after sign-in so the router starts from the page restored by the OIDC callback.
  const router = useMemo(
    () =>
      createBrowserRouter([
        {
          element: <Layout />,
          children: [
            {
              path: "/",
              element: (
                <RequireRole role="planificateur">
                  <MissionsPage />
                </RequireRole>
              ),
            },
          ],
        },
      ]),
    [],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

`web/src/index.css` — append:

```css
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.topbar {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0.5rem 1rem;
  background: #1e2030;
  color: #ffffff;
}
.topbar a {
  color: inherit;
}
.topbar .user {
  margin-left: auto;
}
.page {
  padding: 1rem;
  overflow: auto;
}
.mission-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: end;
}
.mission-form label {
  display: flex;
  flex-direction: column;
}
table {
  border-collapse: collapse;
  margin-top: 1rem;
}
th,
td {
  padding: 0.25rem 0.75rem;
  text-align: left;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test -- src/format.test.ts src/missions`
Expected: PASS (2 + 5 tests).

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): list, create and delete missions"
```

---

### Task 5: Self-hosted basemap map with MGRS readout

**Files:**
- Create: `web/public/map-assets/**` (downloaded), `web/public/map-assets/SOURCE.md`
- Create: `web/src/map/style.ts`, `web/src/map/coordinates.ts`, `web/src/map/CoordinateReadout.tsx`, `web/src/map/MapView.tsx`
- Modify: `web/src/index.css`
- Test: `web/src/map/style.test.ts`, `web/src/map/coordinates.test.ts`, `web/src/map/CoordinateReadout.test.tsx`

**Interfaces:**
- Consumes: `tileHeaders`, `basemapTilesUrl`, `errorMessage` (Task 2); `GET /api/basemaps/{id}/pmtiles` (Task 1).
- Produces:
  - `map/style.ts`: `BASEMAP_SOURCE = "basemap"`, `MAP_FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"]`, `absoluteTilesUrl(basemapId: string): string`, `basemapStyle(basemapId: string | null): StyleSpecification`.
  - `map/coordinates.ts`: `formatLatLon(lng: number, lat: number): string`, `formatMgrs(lng: number, lat: number): string`.
  - `map/MapView.tsx`: `type LngLatBounds2 = [[number, number], [number, number]]`, `MapView({ basemapId: string | null, initialBounds?: LngLatBounds2 | null, onReady?: (map: maplibregl.Map) => void })`. The map is created once per `basemapId` (callers key it by basemap). It fits `initialBounds` when given, otherwise the basemap's bounds from the PMTiles header, and shows an alert when the basemap cannot be read.

- [ ] **Step 1: Download the map assets**

Glyph ranges: `0-255` (Latin-1), `256-511` (Latin Extended-A: œ, Œ), `8192-8447` (typographic punctuation: ’, «, …).

```bash
mkdir -p web/public/map-assets && cd web/public/map-assets
BASE=https://raw.githubusercontent.com/protomaps/basemaps-assets/028c18f713baecad011301ff7a69acc39bcc2ae7
for font in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  for range in 0-255 256-511 8192-8447; do
    curl -fsSL --create-dirs -o "fonts/$font/$range.pbf" "$BASE/fonts/${font// /%20}/$range.pbf"
  done
done
for file in light.json light.png light@2x.json light@2x.png; do
  curl -fsSL --create-dirs -o "sprites/v4/$file" "$BASE/sprites/v4/$file"
done
```

Expected: 13 files, every `curl` exits 0.

Then list the licence files of that commit (`curl -fsSL "https://api.github.com/repos/protomaps/basemaps-assets/contents?ref=028c18f713baecad011301ff7a69acc39bcc2ae7"`, and the same for the `fonts` and `sprites` paths), download every licence or notice file found next to the assets under the same relative path, and write `web/public/map-assets/SOURCE.md`:

```markdown
# Map assets

Copied from https://github.com/protomaps/basemaps-assets at commit
028c18f713baecad011301ff7a69acc39bcc2ae7 so the app never fetches them from the Internet.

- `fonts/<stack>/<range>.pbf`: Noto Sans glyphs, ranges 0-255, 256-511, 8192-8447.
- `sprites/v4/light*`: Protomaps light sprite.

Licences: see the licence files copied alongside. Update all files together when upgrading
`@protomaps/basemaps`; `src/map/style.test.ts` fails if a style needs a font missing here.
```

If the repository has no licence file for fonts or sprites, write that in `SOURCE.md` and ledger it for legal review (same status as the mil-sym licence point in the spec).

- [ ] **Step 2: Write the failing tests**

`web/src/map/style.test.ts`:

```ts
import { existsSync } from "node:fs";
import { basemapStyle, BASEMAP_SOURCE, MAP_FONTS } from "./style";

function fontsUsed(style: ReturnType<typeof basemapStyle>): Set<string> {
  const fonts = style.layers.map((l) => (l as { layout?: Record<string, unknown> }).layout?.["text-font"]);
  return new Set(JSON.stringify(fonts).match(/Noto Sans [A-Za-z]+/g) ?? []);
}

it("loads every resource from the app's own origin", () => {
  const style = basemapStyle("zone-nord");
  expect(style.glyphs).toBe(`${location.origin}/map-assets/fonts/{fontstack}/{range}.pbf`);
  expect(style.sprite).toBe(`${location.origin}/map-assets/sprites/v4/light`);
  expect(style.sources[BASEMAP_SOURCE]).toMatchObject({
    type: "vector",
    url: `pmtiles://${location.origin}/api/basemaps/zone-nord/pmtiles`,
  });
  const urls = JSON.stringify(style).match(/[a-z]+:\/\/[^"]*/g) ?? [];
  for (const url of urls) {
    expect(url.startsWith(location.origin) || url.startsWith(`pmtiles://${location.origin}`)).toBe(
      true,
    );
  }
});

it("labels the map in French with the fonts shipped in public/map-assets", () => {
  const style = basemapStyle("zone-nord");
  expect(style.layers.length).toBeGreaterThan(10);
  const used = fontsUsed(style);
  expect(used.size).toBeGreaterThan(0);
  for (const font of used) expect(MAP_FONTS).toContain(font);
  for (const font of MAP_FONTS) {
    for (const range of ["0-255", "256-511", "8192-8447"]) {
      expect(existsSync(`public/map-assets/fonts/${font}/${range}.pbf`)).toBe(true);
    }
  }
  expect(existsSync("public/map-assets/sprites/v4/light.json")).toBe(true);
  expect(existsSync("public/map-assets/sprites/v4/light@2x.png")).toBe(true);
});

it("shows a plain background when the mission has no basemap", () => {
  const style = basemapStyle(null);
  expect(style.sources).toEqual({});
  expect(style.layers).toEqual([expect.objectContaining({ type: "background" })]);
});
```

`web/src/map/coordinates.test.ts`:

```ts
import { toPoint } from "mgrs";
import { formatLatLon, formatMgrs } from "./coordinates";

it("formats latitude and longitude with hemispheres and 5 decimals", () => {
  expect(formatLatLon(2.29448, 48.85837)).toBe("48.85837° N 2.29448° E");
  expect(formatLatLon(-58.38159, -34.60372)).toBe("34.60372° S 58.38159° W");
});

it("formats MGRS at 1 m precision with grouped digits", () => {
  const text = formatMgrs(2.29448, 48.85837);
  expect(text).toMatch(/^31U [A-Z]{2} \d{5} \d{5}$/);
  const [lng, lat] = toPoint(text.replace(/ /g, ""));
  expect(Math.abs(lng - 2.29448)).toBeLessThan(0.00003);
  expect(Math.abs(lat - 48.85837)).toBeLessThan(0.00003);
});

it("says so when a position has no MGRS reference", () => {
  expect(formatMgrs(10, 85)).toBe("hors zone MGRS");
});
```

`web/src/map/CoordinateReadout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { CoordinateReadout } from "./CoordinateReadout";

it("shows MGRS and lat/lon for the cursor position", () => {
  render(<CoordinateReadout position={{ lng: 2.29448, lat: 48.85837 }} />);
  expect(screen.getByText(/^31U /)).toBeInTheDocument();
  expect(screen.getByText("48.85837° N 2.29448° E")).toBeInTheDocument();
});

it("invites the user to hover the map before any position is known", () => {
  render(<CoordinateReadout position={null} />);
  expect(screen.getByText("Survolez la carte")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd web && npm test -- src/map`
Expected: FAIL — `Failed to resolve import "./style"` / `"./coordinates"` / `"./CoordinateReadout"`.

- [ ] **Step 4: Write minimal implementation**

`web/src/map/style.ts`:

```ts
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";
import { basemapTilesUrl } from "../api/geomap";

export const BASEMAP_SOURCE = "basemap";
export const MAP_FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];

export function absoluteTilesUrl(basemapId: string): string {
  return location.origin + basemapTilesUrl(basemapId);
}

export function basemapStyle(basemapId: string | null): StyleSpecification {
  const assets = `${location.origin}/map-assets`;
  const base = {
    version: 8 as const,
    glyphs: `${assets}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${assets}/sprites/v4/light`,
  };
  if (!basemapId) {
    return {
      ...base,
      sources: {},
      layers: [{ id: "background", type: "background", paint: { "background-color": "#e8e4d8" } }],
    };
  }
  return {
    ...base,
    sources: {
      [BASEMAP_SOURCE]: {
        type: "vector",
        url: `pmtiles://${absoluteTilesUrl(basemapId)}`,
        attribution: "© OpenStreetMap",
      },
    },
    layers: layers(BASEMAP_SOURCE, namedFlavor("light"), { lang: "fr" }),
  };
}
```

`web/src/map/coordinates.ts`:

```ts
import { forward } from "mgrs";

export function formatLatLon(lng: number, lat: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}° ${ns} ${Math.abs(lng).toFixed(5)}° ${ew}`;
}

export function formatMgrs(lng: number, lat: number): string {
  try {
    return forward([lng, lat], 5).replace(/^(\d{1,2}[C-X])([A-Z]{2})(\d{5})(\d{5})$/, "$1 $2 $3 $4");
  } catch {
    // MGRS stops at 84° N and 80° S (polar UPS areas).
    return "hors zone MGRS";
  }
}
```

`web/src/map/CoordinateReadout.tsx`:

```tsx
import { formatLatLon, formatMgrs } from "./coordinates";

export function CoordinateReadout({ position }: { position: { lng: number; lat: number } | null }) {
  if (!position) return <div className="coordinates">Survolez la carte</div>;
  return (
    <div className="coordinates">
      <span>{formatMgrs(position.lng, position.lat)}</span>
      <span>{formatLatLon(position.lng, position.lat)}</span>
    </div>
  );
}
```

`web/src/map/MapView.tsx` (not unit-tested: MapLibre needs WebGL; covered by web-2's Playwright journey):

```tsx
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { FetchSource, PMTiles, Protocol } from "pmtiles";
import { tileHeaders } from "../auth/session";
import { errorMessage } from "../api/client";
import { absoluteTilesUrl, basemapStyle } from "./style";
import { CoordinateReadout } from "./CoordinateReadout";

export type LngLatBounds2 = [[number, number], [number, number]];

const protocol = new Protocol({ metadata: true });
maplibregl.addProtocol("pmtiles", protocol.tile);

interface Props {
  basemapId: string | null;
  initialBounds?: LngLatBounds2 | null;
  onReady?: (map: maplibregl.Map) => void;
}

export function MapView({ basemapId, initialBounds, onReady }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const initialBoundsRef = useRef(initialBounds);
  const [cursor, setCursor] = useState<{ lng: number; lat: number } | null>(null);
  const [basemapError, setBasemapError] = useState<string | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
    initialBoundsRef.current = initialBounds;
  });

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: basemapStyle(basemapId),
      center: [2.35, 46.6],
      zoom: 5,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("mousemove", (e) => setCursor({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    map.on("load", () => onReadyRef.current?.(map));
    const bounds = initialBoundsRef.current;
    if (bounds) map.fitBounds(bounds, { padding: 60, maxZoom: 15, animate: false });
    if (basemapId) {
      // The shared Headers object carries the current token; pmtiles reads it on every request.
      const tiles = new PMTiles(new FetchSource(absoluteTilesUrl(basemapId), tileHeaders));
      protocol.add(tiles);
      tiles.getHeader().then(
        (header) => {
          if (bounds) return;
          map.fitBounds(
            [
              [header.minLon, header.minLat],
              [header.maxLon, header.maxLat],
            ],
            { animate: false },
          );
        },
        (e: unknown) => setBasemapError(errorMessage(e)),
      );
    }
    return () => map.remove();
  }, [basemapId]);

  return (
    <div className="map-frame">
      <div ref={container} className="map" />
      {basemapError && (
        <p role="alert" className="map-alert">
          Fond de carte illisible : {basemapError}
        </p>
      )}
      <CoordinateReadout position={cursor} />
    </div>
  );
}
```

If the `react-hooks` lint rejects the `setBasemapError` call from the promise callback, keep the behaviour, adjust the smallest thing that satisfies the rule, and ledger it; never drop the alert.

`web/src/index.css` — append:

```css
.map-frame {
  position: relative;
  flex: 1;
  min-height: 0;
}
.map {
  position: absolute;
  inset: 0;
}
.coordinates {
  position: absolute;
  right: 0.5rem;
  bottom: 1.5rem;
  display: flex;
  gap: 1rem;
  padding: 0.25rem 0.5rem;
  background: rgb(255 255 255 / 85%);
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
}
.map-alert {
  position: absolute;
  top: 0.5rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.25rem 0.75rem;
  background: #ffffff;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && npm test -- src/map`
Expected: PASS (3 + 3 + 2 tests).

- [ ] **Step 6: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green (map assets are excluded from Prettier and ESLint).

```bash
git add web
git commit -m "feat(web): show the self-hosted basemap with MGRS coordinates"
```

---

### Task 6: Mission objects on the map and editor page

**Files:**
- Create: `web/src/map/geodesy.ts`, `web/src/map/missionLayer.ts`, `web/src/editor/MissionEditorPage.tsx`
- Modify: `web/src/App.tsx`, `web/src/index.css`
- Test: `web/src/map/geodesy.test.ts`, `web/src/map/missionLayer.test.ts`, `web/src/editor/MissionEditorPage.test.tsx`

**Interfaces:**
- Consumes: `MapView`, `LngLatBounds2`, `MAP_FONTS` (Task 5); `MissionForm`, `STATUS_LABELS`, fixtures, `renderWithProviders` (Task 4); `getMission`, `listFeatures`, `updateMission` (Task 2).
- Produces:
  - `map/geodesy.ts`: `type Position = [number, number]`, `destination(from: Position, meters: number, bearingDeg: number): Position`, `distanceMeters(a: Position, b: Position): number`, `circlePolygon(center: Position, radiusMeters: number, steps?: number): Polygon`, `circleFromRing(ring: Position[]): { center: Position; radiusMeters: number }`.
  - `map/missionLayer.ts`: `MISSION_SOURCE = "mission"`, `DEFAULT_COLOR = "#1e66f5"`, `SUGGESTION_COLOR = "#df8e1d"`, `MISSION_LAYERS: LayerSpecification[]`, `CLICKABLE_LAYERS: string[]`, `toFeatureCollection(features: Feature[], hiddenId?: string | null)` (properties `id`, `label`, `color`, `pending`), `boundsOf(features: Feature[]): LngLatBounds2 | null`, `addMissionLayers(map: maplibregl.Map): void`.
  - `editor/MissionEditorPage.tsx`: `MissionEditorPage()` reading `:missionId`; local state `map` used by Tasks 7–8.

- [ ] **Step 1: Write the failing tests**

`web/src/map/geodesy.test.ts`:

```ts
import { circleFromRing, circlePolygon, destination, distanceMeters, type Position } from "./geodesy";

const paris: Position = [2.35, 48.85];

it("moves a given distance along a bearing", () => {
  const north = destination(paris, 1000, 0);
  expect(north[0]).toBeCloseTo(2.35, 9);
  expect(distanceMeters(paris, north)).toBeCloseTo(1000, 2);
  expect(distanceMeters(paris, destination(paris, 2500, 135))).toBeCloseTo(2500, 2);
});

it("builds a closed ring whose vertices sit on the circle", () => {
  const ring = circlePolygon(paris, 2500).coordinates[0] as Position[];
  expect(ring).toHaveLength(65);
  expect(ring[0]).toEqual(ring[64]);
  for (const vertex of ring) expect(distanceMeters(paris, vertex)).toBeCloseTo(2500, 1);
});

it("recovers centre and radius from a drawn ring within one metre", () => {
  const ring = circlePolygon(paris, 2500).coordinates[0] as Position[];
  const { center, radiusMeters } = circleFromRing(ring);
  expect(distanceMeters(center, paris)).toBeLessThan(1);
  expect(Math.abs(radiusMeters - 2500)).toBeLessThan(1);
});
```

`web/src/map/missionLayer.test.ts`:

```ts
import type { Polygon } from "geojson";
import { feature } from "../test/fixtures";
import { distanceMeters, type Position } from "./geodesy";
import { boundsOf, DEFAULT_COLOR, MISSION_LAYERS, toFeatureCollection } from "./missionLayer";
import { MAP_FONTS } from "./style";

it("draws generic objects with their colour and name", () => {
  const collection = toFeatureCollection([
    feature({ id: "a", name: "PC", style: { color: "#40a02b" } }),
    feature({ id: "b", name: "" }),
  ]);
  expect(collection.features.map((f) => f.properties)).toEqual([
    { id: "a", label: "PC", color: "#40a02b", pending: false },
    { id: "b", label: "", color: DEFAULT_COLOR, pending: false },
  ]);
});

it("draws a circle as a polygon of its radius", () => {
  const [circle] = toFeatureCollection([feature({ style: { radiusMeters: 800 } })]).features;
  expect(circle.geometry.type).toBe("Polygon");
  const ring = (circle.geometry as Polygon).coordinates[0] as Position[];
  expect(distanceMeters([2.35, 48.85], ring[0])).toBeCloseTo(800, 0);
});

it("flags pending suggestions and leaves rejected ones and the edited object out", () => {
  const collection = toFeatureCollection(
    [
      feature({ id: "p", origin: "AI_SUGGESTED", suggestionStatus: "PENDING" }),
      feature({ id: "r", origin: "AI_SUGGESTED", suggestionStatus: "REJECTED" }),
      feature({ id: "e" }),
    ],
    "e",
  );
  expect(collection.features.map((f) => [f.properties.id, f.properties.pending])).toEqual([
    ["p", true],
  ]);
});

it("labels an unnamed APP-6D object with its SIDC", () => {
  const [symbol] = toFeatureCollection([
    feature({ kind: "APP6", name: "", sidc: "10031000001211000000" }),
  ]).features;
  expect(symbol.properties.label).toBe("10031000001211000000");
});

it("frames every visible object", () => {
  expect(boundsOf([])).toBeNull();
  expect(
    boundsOf([
      feature({ bbox: { minLon: 1, minLat: 2, maxLon: 3, maxLat: 4 } }),
      feature({ bbox: { minLon: -1, minLat: 3, maxLon: 2, maxLat: 5 } }),
      feature({
        suggestionStatus: "REJECTED",
        bbox: { minLon: -50, minLat: -50, maxLon: 50, maxLat: 50 },
      }),
    ]),
  ).toEqual([
    [-1, 2],
    [3, 5],
  ]);
});

it("labels objects with a shipped font", () => {
  const label = MISSION_LAYERS.find((l) => l.id === "mission-label") as {
    layout?: Record<string, unknown>;
  };
  expect(label.layout?.["text-font"]).toEqual([MAP_FONTS[0]]);
});
```

`web/src/editor/MissionEditorPage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { basemap, feature, mission } from "../test/fixtures";
import { MissionEditorPage } from "./MissionEditorPage";

vi.mock("../map/MapView", () => ({
  MapView: (props: { basemapId: string | null; initialBounds?: unknown }) => (
    <div
      data-testid="map"
      data-basemap={props.basemapId ?? ""}
      data-bounds={JSON.stringify(props.initialBounds ?? null)}
    />
  ),
}));

const id = "11111111-1111-4111-8111-111111111111";
const route = { route: `/missions/${id}`, path: "/missions/:missionId" };

function serve(current = mission(), features = [feature()]) {
  server.use(
    http.get(`/api/missions/${id}`, () => HttpResponse.json(current)),
    http.get(`/api/missions/${id}/features`, () => HttpResponse.json(features)),
    http.get("/api/basemaps", () => HttpResponse.json([basemap()])),
  );
}

it("opens the mission on its basemap, framed on its objects", async () => {
  serve();
  renderWithProviders(<MissionEditorPage />, route);
  expect(await screen.findByRole("heading", { name: "Op Nord" })).toBeInTheDocument();
  expect(screen.getByText("Brouillon")).toBeInTheDocument();
  const map = screen.getByTestId("map");
  expect(map).toHaveAttribute("data-basemap", "zone-nord");
  expect(map).toHaveAttribute(
    "data-bounds",
    JSON.stringify([
      [2.35, 48.85],
      [2.35, 48.85],
    ]),
  );
});

it("still opens a mission without a basemap and says what to do", async () => {
  serve(mission({ basemapId: null }), []);
  renderWithProviders(<MissionEditorPage />, route);
  expect(await screen.findByRole("status")).toHaveTextContent("Aucun fond de carte");
  expect(screen.getByTestId("map")).toHaveAttribute("data-basemap", "");
});

it("saves mission settings", async () => {
  serve();
  let patch: unknown;
  server.use(
    http.patch(`/api/missions/${id}`, async ({ request }) => {
      patch = await request.json();
      return HttpResponse.json(mission({ name: "Op Nord 2" }));
    }),
  );
  renderWithProviders(<MissionEditorPage />, route);
  const user = userEvent.setup();
  await user.click(await screen.findByText("Paramètres"));
  await screen.findByRole("option", { name: "Zone Nord" });
  const name = screen.getByLabelText("Nom");
  await user.clear(name);
  await user.type(name, "Op Nord 2");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() =>
    expect(patch).toEqual({
      name: "Op Nord 2",
      basemapId: "zone-nord",
      validUntil: "2026-10-02T06:00:00Z",
    }),
  );
});

it("reports a mission that cannot be loaded", async () => {
  server.use(
    http.get(`/api/missions/${id}`, () =>
      HttpResponse.json({ status: 404, detail: "mission not found" }, { status: 404 }),
    ),
    http.get(`/api/missions/${id}/features`, () => HttpResponse.json([])),
  );
  renderWithProviders(<MissionEditorPage />, route);
  expect(await screen.findByRole("alert")).toHaveTextContent("mission not found");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/map/geodesy.test.ts src/map/missionLayer.test.ts src/editor`
Expected: FAIL — `Failed to resolve import "./geodesy"` / `"./missionLayer"` / `"./MissionEditorPage"`.

- [ ] **Step 3: Write minimal implementation**

`web/src/map/geodesy.ts`:

```ts
import type { Polygon } from "geojson";

export type Position = [number, number];

const EARTH_RADIUS_METERS = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function destination([lon, lat]: Position, meters: number, bearingDeg: number): Position {
  const angle = meters / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(lat);
  const lon1 = toRadians(lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angle) + Math.cos(lat1) * Math.sin(angle) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angle) * Math.cos(lat1),
      Math.cos(angle) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [((toDegrees(lon2) + 540) % 360) - 180, toDegrees(lat2)];
}

export function distanceMeters([lon1, lat1]: Position, [lon2, lat2]: Position): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function circlePolygon(center: Position, radiusMeters: number, steps = 64): Polygon {
  const ring = Array.from({ length: steps }, (_, i) =>
    destination(center, radiusMeters, (360 * i) / steps),
  );
  return { type: "Polygon", coordinates: [[...ring, ring[0]]] };
}

// ponytail: centre = mean of the vertices, within a metre for the regular rings Terra Draw
// draws; wrong across the antimeridian or near the poles, where no mission area lies today.
export function circleFromRing(ring: Position[]): { center: Position; radiusMeters: number } {
  const vertices = ring.slice(0, -1);
  const center: Position = [
    vertices.reduce((sum, [lon]) => sum + lon, 0) / vertices.length,
    vertices.reduce((sum, [, lat]) => sum + lat, 0) / vertices.length,
  ];
  const radiusMeters =
    vertices.reduce((sum, vertex) => sum + distanceMeters(center, vertex), 0) / vertices.length;
  return { center, radiusMeters };
}
```

`web/src/map/missionLayer.ts`:

```ts
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
```

`web/src/editor/MissionEditorPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { getMission, listFeatures, updateMission } from "../api/geomap";
import { errorMessage } from "../api/client";
import { STATUS_LABELS } from "../format";
import { MissionForm } from "../missions/MissionForm";
import { MapView } from "../map/MapView";
import {
  addMissionLayers,
  boundsOf,
  MISSION_SOURCE,
  toFeatureCollection,
} from "../map/missionLayer";

export function MissionEditorPage() {
  const { missionId = "" } = useParams();
  const queryClient = useQueryClient();
  const mission = useQuery({ queryKey: ["mission", missionId], queryFn: () => getMission(missionId) });
  const features = useQuery({
    queryKey: ["features", missionId],
    queryFn: () => listFeatures(missionId),
  });
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!map || !features.data) return;
    map.getSource<GeoJSONSource>(MISSION_SOURCE)?.setData(toFeatureCollection(features.data));
  }, [map, features.data]);

  if (mission.error || features.error) {
    return <p role="alert">{errorMessage(mission.error ?? features.error)}</p>;
  }
  if (!mission.data || !features.data) return <p>Chargement…</p>;
  const current = mission.data;

  return (
    <div className="editor">
      <aside className="panel">
        <h1>{current.name}</h1>
        <p>{STATUS_LABELS[current.status]}</p>
        {!current.basemapId && (
          <p role="status">Aucun fond de carte : choisissez-en un dans les paramètres.</p>
        )}
        <details>
          <summary>Paramètres</summary>
          <MissionForm
            initial={current}
            submitLabel="Enregistrer"
            onSubmit={async (input) => {
              await updateMission(missionId, input);
              await queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
            }}
          />
        </details>
      </aside>
      <MapView
        key={current.basemapId ?? "none"}
        basemapId={current.basemapId}
        initialBounds={boundsOf(features.data)}
        onReady={(ready) => {
          addMissionLayers(ready);
          setMap(ready);
        }}
      />
    </div>
  );
}
```

If `map.getSource<GeoJSONSource>` is not generic in maplibre-gl 6.11.2, use `(map.getSource(MISSION_SOURCE) as GeoJSONSource | undefined)`.

`web/src/App.tsx` — import `MissionEditorPage` from `./editor/MissionEditorPage` and add this route after `/` in `children`:

```tsx
            {
              path: "/missions/:missionId",
              element: (
                <RequireRole role="planificateur">
                  <MissionEditorPage />
                </RequireRole>
              ),
            },
```

`web/src/index.css` — append:

```css
.editor {
  display: flex;
  flex: 1;
  min-height: 0;
}
.panel {
  width: 22rem;
  padding: 0.75rem;
  overflow: auto;
  border-right: 1px solid #ccd0da;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS — 3 geodesy, 6 missionLayer, 4 editor tests and every earlier test.

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): open a mission and show its objects on the map"
```

---

### Task 7: Draw and reshape generic objects with Terra Draw

**Files:**
- Create: `web/src/map/drawing.ts`, `web/src/map/useDrawing.ts`, `web/src/editor/DrawToolbar.tsx`
- Modify: `web/src/editor/MissionEditorPage.tsx`
- Test: `web/src/map/drawing.test.ts`, `web/src/editor/DrawToolbar.test.tsx`

**Interfaces:**
- Consumes: `circlePolygon`, `circleFromRing`, `Position` (Task 6); `CLICKABLE_LAYERS`, `toFeatureCollection(features, hiddenId)` (Task 6); `createFeature`, `updateFeature`, `Feature`, `FeatureInput`, `Geometry` (Task 2).
- Produces:
  - `map/drawing.ts`: `type DrawMode = "point" | "linestring" | "polygon" | "circle"`, `toFeatureInput(drawn: GeoJSONStoreFeatures, base?: Feature): FeatureInput`, `toDrawFeature(feature: Feature): GeoJSONStoreFeatures | null`.
  - `map/useDrawing.ts`: `type ToolMode = DrawMode | "select" | "static"`, `useDrawing(map, { onCreate(drawn), onChange(featureId, drawn) }): { mode: ToolMode; setMode(mode: DrawMode | "static"): void; edit(feature: Feature): string | null; stopEditing(): void }` (`edit` returns an error message or `null`).
  - `editor/DrawToolbar.tsx`: `DrawToolbar({ mode: ToolMode, onMode(mode: DrawMode | "static"): void })`.
  - Editor: `selectedId: string | null` state and `select(feature: Feature | null)` function, used by Task 8.

- [ ] **Step 1: Write the failing tests**

`web/src/map/drawing.test.ts`:

```ts
import type { GeoJSONStoreFeatures } from "terra-draw";
import type { Point } from "geojson";
import { feature } from "../test/fixtures";
import { circlePolygon, distanceMeters, type Position } from "./geodesy";
import { toDrawFeature, toFeatureInput } from "./drawing";

const drawn = (geometry: GeoJSONStoreFeatures["geometry"], mode: string, extra = {}) =>
  ({ type: "Feature", id: "td-1", geometry, properties: { mode, ...extra } }) as GeoJSONStoreFeatures;

it("turns a drawn point, line or zone into a generic object", () => {
  const line = drawn(
    {
      type: "LineString",
      coordinates: [
        [2, 48],
        [2.1, 48.1],
      ],
    },
    "linestring",
  );
  expect(toFeatureInput(line)).toEqual({
    kind: "GENERIC",
    geometry: {
      type: "LineString",
      coordinates: [
        [2, 48],
        [2.1, 48.1],
      ],
    },
    name: "",
    description: "",
    style: null,
  });
});

it("stores a drawn circle as its centre and radius", () => {
  const input = toFeatureInput(drawn(circlePolygon([2.35, 48.85], 1500), "circle"));
  expect(input.geometry.type).toBe("Point");
  const center = (input.geometry as Point).coordinates as Position;
  expect(distanceMeters(center, [2.35, 48.85])).toBeLessThan(1);
  expect(Math.abs((input.style?.radiusMeters ?? 0) - 1500)).toBeLessThan(1);
});

it("keeps the name, description and colour of the object being reshaped", () => {
  const base = feature({
    name: "PC",
    description: "abri",
    style: { color: "#40a02b", radiusMeters: 500 },
  });
  const input = toFeatureInput(drawn(circlePolygon([2.35, 48.85], 700), "circle"), base);
  expect(input).toMatchObject({ name: "PC", description: "abri", style: { color: "#40a02b" } });
  expect(Math.abs((input.style?.radiusMeters ?? 0) - 700)).toBeLessThan(1);
});

it("opens a saved circle for editing as a Terra Draw circle", () => {
  const editable = toDrawFeature(feature({ id: "c", style: { radiusMeters: 1000 } }));
  expect(editable).toMatchObject({ id: "c", properties: { mode: "circle", radiusKilometers: 1 } });
  expect(editable?.geometry.type).toBe("Polygon");
});

it("rounds coordinates to the precision Terra Draw accepts", () => {
  const editable = toDrawFeature(feature({ style: { radiusMeters: 1234.5 } }));
  const decimals = JSON.stringify(editable?.geometry.coordinates).match(/\.\d+/g) ?? [];
  for (const d of decimals) expect(d.length - 1).toBeLessThanOrEqual(9);
});

it("maps saved geometries to their drawing mode", () => {
  expect(toDrawFeature(feature())?.properties.mode).toBe("point");
  const line = feature({
    geometry: {
      type: "LineString",
      coordinates: [
        [2, 48],
        [3, 49],
      ],
    },
  });
  expect(toDrawFeature(line)?.properties.mode).toBe("linestring");
  expect(toDrawFeature(feature({ kind: "APP6", sidc: "10031000001211000000" }))).toBeNull();
});
```

`web/src/editor/DrawToolbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DrawToolbar } from "./DrawToolbar";

it("offers every drawing tool and marks the active one", async () => {
  const onMode = vi.fn();
  render(<DrawToolbar mode="polygon" onMode={onMode} />);
  expect(screen.getByRole("button", { name: "Zone" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Point" })).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(screen.getByRole("button", { name: "Cercle" }));
  expect(onMode).toHaveBeenCalledWith("circle");
  await userEvent.click(screen.getByRole("button", { name: "Ligne" }));
  expect(onMode).toHaveBeenCalledWith("linestring");
  await userEvent.click(screen.getByRole("button", { name: "Terminer" }));
  expect(onMode).toHaveBeenCalledWith("static");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/map/drawing.test.ts src/editor/DrawToolbar.test.tsx`
Expected: FAIL — `Failed to resolve import "./drawing"` / `"./DrawToolbar"`.

- [ ] **Step 3: Write minimal implementation**

`web/src/map/drawing.ts`:

```ts
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
```

`web/src/map/useDrawing.ts` (not unit-tested: Terra Draw needs a live MapLibre map; covered by web-2's Playwright journey):

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type * as maplibregl from "maplibre-gl";
import {
  TerraDraw,
  TerraDrawCircleMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { Feature } from "../api/geomap";
import { toDrawFeature, type DrawMode } from "./drawing";

export type ToolMode = DrawMode | "select" | "static";

const RESHAPE = {
  draggable: true,
  coordinates: { draggable: true, deletable: true, midpoints: true },
};

const SELECT_FLAGS = {
  point: { feature: { draggable: true } },
  linestring: { feature: RESHAPE },
  polygon: { feature: RESHAPE },
  circle: { feature: { draggable: true, coordinates: { resizable: "center" as const } } },
};

interface Handlers {
  onCreate: (drawn: GeoJSONStoreFeatures) => void;
  onChange: (featureId: string, drawn: GeoJSONStoreFeatures) => void;
}

export function useDrawing(map: maplibregl.Map | null, handlers: Handlers) {
  const drawRef = useRef<TerraDraw | null>(null);
  const handlersRef = useRef(handlers);
  const [mode, setModeState] = useState<ToolMode>("static");

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!map) return;
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawPointMode(),
        new TerraDrawLineStringMode(),
        new TerraDrawPolygonMode(),
        new TerraDrawCircleMode(),
        new TerraDrawSelectMode({ flags: SELECT_FLAGS }),
      ],
    });
    draw.start();
    draw.on("finish", (id, context) => {
      const drawn = draw.getSnapshotFeature(id);
      if (!drawn) return;
      if (context.action === "draw") {
        // The saved copy comes back from the server and is shown by the mission layer.
        draw.removeFeatures([id]);
        handlersRef.current.onCreate(drawn);
      } else {
        handlersRef.current.onChange(String(id), drawn);
      }
    });
    drawRef.current = draw;
    return () => {
      draw.stop();
      drawRef.current = null;
    };
  }, [map]);

  const setMode = useCallback((next: DrawMode | "static") => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.clear();
    draw.setMode(next);
    setModeState(next);
  }, []);

  const edit = useCallback((feature: Feature): string | null => {
    const draw = drawRef.current;
    const editable = toDrawFeature(feature);
    if (!draw) return "Carte non prête.";
    if (!editable) return "Seuls les objets génériques se modifient sur la carte.";
    draw.clear();
    const [result] = draw.addFeatures([editable]);
    if (!result?.valid) return `Géométrie non modifiable : ${result?.reason ?? "invalide"}`;
    draw.setMode("select");
    draw.selectFeature(feature.id);
    setModeState("select");
    return null;
  }, []);

  const stopEditing = useCallback(() => setMode("static"), [setMode]);

  return { mode, setMode, edit, stopEditing };
}
```

Before relying on `context.action === "draw"` and on the select-mode flag names (`resizable: "center"` for circles), read the installed declarations under `node_modules/terra-draw/dist/` (`OnFinishContext`, the select-mode `flags` type). If 1.35.0 names them differently, use the installed names and ledger the ruling.

`web/src/editor/DrawToolbar.tsx`:

```tsx
import type { DrawMode } from "../map/drawing";
import type { ToolMode } from "../map/useDrawing";

const TOOLS: { mode: DrawMode; label: string }[] = [
  { mode: "point", label: "Point" },
  { mode: "linestring", label: "Ligne" },
  { mode: "polygon", label: "Zone" },
  { mode: "circle", label: "Cercle" },
];

export function DrawToolbar({
  mode,
  onMode,
}: {
  mode: ToolMode;
  onMode: (mode: DrawMode | "static") => void;
}) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Dessin">
      {TOOLS.map((tool) => (
        <button key={tool.mode} aria-pressed={mode === tool.mode} onClick={() => onMode(tool.mode)}>
          {tool.label}
        </button>
      ))}
      <button onClick={() => onMode("static")}>Terminer</button>
    </div>
  );
}
```

`web/src/editor/MissionEditorPage.tsx` — wire drawing. Add imports: `createFeature`, `updateFeature`, `type Feature` from `../api/geomap`; `useDrawing` from `../map/useDrawing`; `toFeatureInput` from `../map/drawing`; `DrawToolbar` from `./DrawToolbar`; `CLICKABLE_LAYERS` from `../map/missionLayer`. Inside the component, right after the `map` state (all hooks stay before the early `return`s):

```tsx
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const refreshFeatures = () =>
    queryClient.invalidateQueries({ queryKey: ["features", missionId] });

  const drawing = useDrawing(map, {
    onCreate: (drawn) => {
      setDrawError(null);
      createFeature(missionId, toFeatureInput(drawn)).then(refreshFeatures, (e: unknown) =>
        setDrawError(errorMessage(e)),
      );
    },
    onChange: (featureId, drawn) => {
      const base = features.data?.find((f) => f.id === featureId);
      if (!base) return;
      setDrawError(null);
      updateFeature(missionId, featureId, toFeatureInput(drawn, base)).then(
        refreshFeatures,
        (e: unknown) => {
          setDrawError(errorMessage(e));
          // Put the saved shape back so the map shows what the server holds.
          drawing.edit(base);
        },
      );
    },
  });

  function select(feature: Feature | null) {
    setSelectedId(feature?.id ?? null);
    setDrawError(null);
    if (!feature) return drawing.stopEditing();
    if (feature.kind === "GENERIC") setDrawError(drawing.edit(feature));
  }

  useEffect(() => {
    if (!map) return;
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      const clicked = id ? features.data?.find((f) => f.id === id) : undefined;
      if (clicked && drawing.mode === "static") select(clicked);
    };
    map.on("click", CLICKABLE_LAYERS, onClick);
    return () => void map.off("click", CLICKABLE_LAYERS, onClick);
  });
```

Replace the Task 6 source-update effect so the object being reshaped is not drawn twice:

```tsx
  const editingId = drawing.mode === "select" ? selectedId : null;
  useEffect(() => {
    if (!map || !features.data) return;
    map
      .getSource<GeoJSONSource>(MISSION_SOURCE)
      ?.setData(toFeatureCollection(features.data, editingId));
  }, [map, features.data, editingId]);
```

In the JSX, inside `<aside>` after the settings `<details>`:

```tsx
        <DrawToolbar
          mode={drawing.mode}
          onMode={(next) => {
            setSelectedId(null);
            drawing.setMode(next);
          }}
        />
        {drawError && <p role="alert">{drawError}</p>}
```

`updateFeature` sends `kind: "GENERIC"` from `toFeatureInput`; only generic objects reach Terra Draw, so this matches the object's kind. If the click effect without a dependency list trips `react-hooks` lint, give it `[map, features.data, drawing]` and wrap `select` in `useCallback`; ledger what you chose.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS — 6 drawing tests, 1 toolbar test and every earlier test (the editor tests mock `MapView`, so `map` stays `null` and Terra Draw is never created).

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`
Expected: all green.

```bash
git add web
git commit -m "feat(web): draw and reshape generic objects with Terra Draw"
```

---

### Task 8: Object panel and AI suggestions

**Files:**
- Create: `web/src/editor/FeaturePanel.tsx`
- Modify: `web/src/editor/MissionEditorPage.tsx`, `web/src/index.css`
- Test: `web/src/editor/FeaturePanel.test.tsx`

**Interfaces:**
- Consumes: `updateFeature`, `deleteFeature`, `acceptFeature`, `rejectFeature`, `errorMessage` (Task 2); `DEFAULT_COLOR` (Task 6); editor `select(feature | null)` and `selectedId` (Task 7); fixtures and `renderWithProviders` (Task 4).
- Produces: `FeaturePanel({ missionId: string, features: Feature[], selectedId: string | null, onSelect(feature: Feature | null): void })`. It invalidates `["features", missionId]` after every change.

- [ ] **Step 1: Write the failing test**

`web/src/editor/FeaturePanel.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { feature } from "../test/fixtures";
import type { Feature } from "../api/geomap";
import { FeaturePanel } from "./FeaturePanel";

const missionId = "11111111-1111-4111-8111-111111111111";
const path = `/api/missions/${missionId}/features`;

const circle = feature({
  id: "c1",
  name: "Zone de poser",
  style: { color: "#40a02b", radiusMeters: 800 },
});
const suggestion = feature({
  id: "s1",
  name: "Point d'appui proposé",
  origin: "AI_SUGGESTED",
  suggestionStatus: "PENDING",
  geometry: {
    type: "LineString",
    coordinates: [
      [2, 48],
      [2.1, 48.1],
    ],
  },
});
const rejected = feature({
  id: "r1",
  name: "Rejeté",
  origin: "AI_SUGGESTED",
  suggestionStatus: "REJECTED",
});
const symbol = feature({ id: "a1", name: "", kind: "APP6", sidc: "10031000001211000000" });

function panel(selectedId: string | null = null, onSelect = vi.fn()) {
  server.use(http.get(path, () => HttpResponse.json([])));
  renderWithProviders(
    <FeaturePanel
      missionId={missionId}
      features={[circle, suggestion, rejected, symbol]}
      selectedId={selectedId}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

it("lists visible objects with their type and marks AI suggestions", async () => {
  panel();
  expect(await screen.findByRole("button", { name: /Zone de poser.*Cercle/ })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Point d'appui proposé.*Ligne.*Suggestion IA/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Sans nom.*APP-6D 10031000001211000000/ }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Rejeté")).not.toBeInTheDocument();
});

it("selects an object from the list", async () => {
  const onSelect = panel();
  await userEvent.click(await screen.findByRole("button", { name: /Zone de poser/ }));
  expect(onSelect).toHaveBeenCalledWith(circle);
});

it("accepts or rejects a pending suggestion", async () => {
  const calls: string[] = [];
  server.use(
    http.post(`${path}/:id/:decision`, ({ params }) => {
      calls.push(`${params.id} ${params.decision}`);
      return HttpResponse.json(suggestion);
    }),
  );
  panel();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Accepter Point d'appui proposé" }));
  await user.click(screen.getByRole("button", { name: "Rejeter Point d'appui proposé" }));
  await waitFor(() => expect(calls).toEqual(["s1 accept", "s1 reject"]));
});

it("renames and recolours an object without touching its geometry or radius", async () => {
  let body: Partial<Feature> | undefined;
  server.use(
    http.put(`${path}/c1`, async ({ request }) => {
      body = (await request.json()) as Partial<Feature>;
      return HttpResponse.json(circle);
    }),
  );
  panel("c1");
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Nom de l'objet");
  await user.clear(name);
  await user.type(name, "Zone de poser Alpha");
  await user.type(screen.getByLabelText("Description"), "hélicoptères");
  await user.click(screen.getByRole("button", { name: "Enregistrer l'objet" }));
  await waitFor(() =>
    expect(body).toEqual({
      kind: "GENERIC",
      geometry: circle.geometry,
      name: "Zone de poser Alpha",
      description: "hélicoptères",
      style: { color: "#40a02b", radiusMeters: 800 },
      sidc: null,
      modifiers: null,
    }),
  );
});

it("deletes an object only after confirmation and clears the selection", async () => {
  const deleted = vi.fn();
  server.use(
    http.delete(`${path}/c1`, () => {
      deleted();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const onSelect = panel("c1");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Supprimer l'objet" }));
  expect(deleted).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));
  await waitFor(() => expect(deleted).toHaveBeenCalled());
  expect(onSelect).toHaveBeenCalledWith(null);
});

it("shows the server's reason when a change is refused", async () => {
  server.use(
    http.put(`${path}/c1`, () =>
      HttpResponse.json(
        { status: 409, detail: "a withdrawn mission cannot be edited" },
        { status: 409 },
      ),
    ),
  );
  panel("c1");
  await userEvent.click(await screen.findByRole("button", { name: "Enregistrer l'objet" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("a withdrawn mission cannot be edited");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- src/editor/FeaturePanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./FeaturePanel"`.

- [ ] **Step 3: Write minimal implementation**

`web/src/editor/FeaturePanel.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  acceptFeature,
  deleteFeature,
  rejectFeature,
  updateFeature,
  type Feature,
} from "../api/geomap";
import { errorMessage } from "../api/client";
import { DEFAULT_COLOR } from "../map/missionLayer";

interface Props {
  missionId: string;
  features: Feature[];
  selectedId: string | null;
  onSelect: (feature: Feature | null) => void;
}

function typeLabel(f: Feature): string {
  if (f.kind === "APP6") return `APP-6D ${f.sidc ?? ""}`;
  if (f.geometry.type === "Point") return f.style?.radiusMeters ? "Cercle" : "Point";
  return f.geometry.type === "LineString" ? "Ligne" : "Zone";
}

const isPending = (f: Feature) => f.suggestionStatus === "PENDING";

export function FeaturePanel({ missionId, features, selectedId, onSelect }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const visible = features.filter((f) => f.suggestionStatus !== "REJECTED");
  const selected = visible.find((f) => f.id === selectedId) ?? null;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["features", missionId] });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="features">
      <h2>Objets ({visible.length})</h2>
      {error && <p role="alert">{error}</p>}
      <ul>
        {visible.map((f) => {
          const name = f.name || "Sans nom";
          return (
            <li key={f.id} className={f.id === selectedId ? "selected" : undefined}>
              <button className="feature-item" onClick={() => onSelect(f)}>
                <span>{name}</span> <small>{typeLabel(f)}</small>
                {isPending(f) && <span className="badge"> Suggestion IA</span>}
              </button>
              {isPending(f) && (
                <span className="decision">
                  <button
                    aria-label={`Accepter ${name}`}
                    onClick={() => void run(() => acceptFeature(missionId, f.id))}
                  >
                    Accepter
                  </button>
                  <button
                    aria-label={`Rejeter ${name}`}
                    onClick={() => void run(() => rejectFeature(missionId, f.id))}
                  >
                    Rejeter
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {selected && (
        <FeatureDetails
          key={selected.id}
          feature={selected}
          onSave={(changes) =>
            run(() =>
              updateFeature(missionId, selected.id, {
                kind: selected.kind,
                geometry: selected.geometry,
                name: changes.name,
                description: changes.description,
                style:
                  selected.kind === "GENERIC"
                    ? { ...selected.style, color: changes.color }
                    : selected.style,
                sidc: selected.sidc,
                modifiers: selected.modifiers,
              }),
            )
          }
          onDelete={() =>
            run(async () => {
              await deleteFeature(missionId, selected.id);
              onSelect(null);
            })
          }
        />
      )}
    </section>
  );
}

interface Changes {
  name: string;
  description: string;
  color: string;
}

function FeatureDetails({
  feature,
  onSave,
  onDelete,
}: {
  feature: Feature;
  onSave: (changes: Changes) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(feature.name);
  const [description, setDescription] = useState(feature.description);
  const [color, setColor] = useState(feature.style?.color ?? DEFAULT_COLOR);
  const [confirming, setConfirming] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSave({ name: name.trim(), description, color });
  }

  return (
    <form className="feature-details" onSubmit={submit}>
      <label>
        Nom de l'objet
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </label>
      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
        />
      </label>
      {feature.kind === "GENERIC" && (
        <label>
          Couleur
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      )}
      <button type="submit">Enregistrer l'objet</button>
      {confirming ? (
        <>
          <button type="button" onClick={() => void onDelete()}>
            Confirmer la suppression
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            Annuler
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          Supprimer l'objet
        </button>
      )}
    </form>
  );
}
```

Saving an unchanged generic object that had no colour stores `style.color = DEFAULT_COLOR`, making the default explicit; that is intended.

`web/src/editor/MissionEditorPage.tsx` — import `FeaturePanel` from `./FeaturePanel` and add inside `<aside>`, after the draw error:

```tsx
        <FeaturePanel
          missionId={missionId}
          features={features.data}
          selectedId={selectedId}
          onSelect={select}
        />
```

`web/src/index.css` — append:

```css
.features ul {
  list-style: none;
  padding: 0;
}
.features li.selected .feature-item {
  font-weight: bold;
}
.feature-item {
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}
.badge {
  color: #df8e1d;
}
.feature-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.feature-details label {
  display: flex;
  flex-direction: column;
}
.toolbar {
  display: flex;
  gap: 0.25rem;
  margin: 0.5rem 0;
}
.toolbar [aria-pressed="true"] {
  font-weight: bold;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS — 6 FeaturePanel tests and every earlier test.

- [ ] **Step 5: Run the gate and commit**

Run: `cd web && npx prettier --write . && npm run check`, then `make check` at the repo root.
Expected: all green for `shared`, `server` and `web`.

```bash
git add web
git commit -m "feat(web): edit objects and review AI suggestions from the object panel"
```
