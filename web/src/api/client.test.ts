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
