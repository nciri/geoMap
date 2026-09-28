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
