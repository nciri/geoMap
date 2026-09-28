import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { loadConfig } from "./config";

it("reads the identity provider settings", async () => {
  server.use(
    http.get("/config.json", () =>
      HttpResponse.json({ oidcAuthority: "https://kc/realms/geomap", oidcClientId: "geomap-web" }),
    ),
  );
  await expect(loadConfig()).resolves.toEqual({
    oidcAuthority: "https://kc/realms/geomap",
    oidcClientId: "geomap-web",
  });
});

it("names the HTTP status when the config cannot be fetched", async () => {
  server.use(http.get("/config.json", () => new HttpResponse(null, { status: 503 })));
  await expect(loadConfig()).rejects.toThrow("HTTP 503");
});

it("names both required settings when one is missing", async () => {
  server.use(http.get("/config.json", () => HttpResponse.json({ oidcAuthority: "https://kc" })));
  await expect(loadConfig()).rejects.toThrow(/oidcAuthority.*oidcClientId/);
});
