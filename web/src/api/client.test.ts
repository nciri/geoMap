import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { api, ApiError, apiResponse, uploadWithProgress } from "./client";
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
      HttpResponse.json(
        { status: 409, detail: "basemap zone-nord already exists" },
        { status: 409 },
      ),
    ),
  );
  await expect(
    uploadWithProgress("/api/basemaps/zone-nord", new Blob([new Uint8Array(1)]), () => {}),
  ).rejects.toMatchObject({ status: 409, message: "basemap zone-nord already exists" });
});
