import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signIn } from "./helpers";
import { api, boundsOf, mapLngLat, mapPoint, type BBox } from "./map";

test.describe.configure({ mode: "serial" });

const suffix = randomBytes(3).toString("hex");
const missionName = `Op Nord ${suffix}`;

interface StoredFeature {
  id: string;
  kind: "GENERIC" | "APP6";
  geometry: { type: string; coordinates: unknown };
  bbox: BBox;
  style: { radiusMeters?: number } | null;
}

async function uploadBasemap(page: Page, id: string, name: string) {
  await page.getByLabel("Identifiant").fill(id);
  await page.getByLabel("Nom").fill(name);
  await page.getByLabel("Fichier PMTiles").setInputFiles({
    name: `${id}.pmtiles`,
    mimeType: "application/octet-stream",
    buffer: readFileSync("e2e/fixtures/vector.pmtiles"),
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
  // The view jumps to the basemap's extent once its header is read; drawing before that
  // would place the closing click away from the first point.
  await expect(page.locator(".maplibregl-ctrl-scale")).not.toContainText("km");

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
  await page
    .getByRole("button", { name: /^Infantry/ })
    .first()
    .click();
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
  // Map clicks are handled only once the map has loaded, which also enables the drawing tools.
  await expect(page.getByRole("button", { name: "Zone", exact: true })).toBeEnabled();

  // Delete in select mode must not remove anything, locally or on the server.
  await page.getByRole("button", { name: /Sans nom.*Zone/ }).click();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("button", { name: /Sans nom.*Zone/ })).toBeVisible();
  expect((await features()).length).toBe(before.length);

  // Clicking another object on the map while reshaping selects it.
  const symbol = before.find((f) => f.kind === "APP6")!;
  await mapLngLat(
    page,
    boundsOf(before.map((f) => f.bbox)),
    symbol.geometry.coordinates as [number, number],
  );
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
