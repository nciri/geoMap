import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const suffix = randomBytes(3).toString("hex");
const missionName = `Op Ortho ${suffix}`;

test("an administrator imports a vector basemap and an imagery archive", async ({ page }) => {
  await signIn(page, "admin");
  await page.getByRole("link", { name: "Fonds de carte" }).click();
  for (const [id, file] of [
    [`base-${suffix}`, "e2e/fixtures/vector.pmtiles"],
    [`ortho-${suffix}`, "e2e/fixtures/imagery.pmtiles"],
  ]) {
    await page.getByLabel("Identifiant").fill(id);
    await page.getByLabel("Nom").fill(id);
    await page.getByLabel("Fichier PMTiles").setInputFiles({
      name: `${id}.pmtiles`,
      mimeType: "application/octet-stream",
      buffer: readFileSync(file),
    });
    await page.getByRole("button", { name: "Importer" }).click();
    await expect(page.getByRole("status")).toContainText(id);
  }
  await expect(
    page.getByRole("row", { name: new RegExp(`base-${suffix}.*Vectoriel`) }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(`ortho-${suffix}.*Imagerie.*IGN`) }),
  ).toBeVisible();
});

test("a planner stacks imagery and switches between Carte, Satellite and Hybride", async ({
  page,
}) => {
  await signIn(page, "planner");
  await page.getByRole("button", { name: "Nouvelle mission" }).click();
  await page.getByLabel("Nom").fill(missionName);
  await page.getByLabel("Fond de carte").selectOption({ label: `base-${suffix}` });
  await page.getByLabel("Ajouter une imagerie").selectOption({ label: `ortho-${suffix}` });
  await expect(page.getByRole("button", { name: `Retirer ortho-${suffix}` })).toBeVisible();
  await page.getByRole("button", { name: "Créer la mission" }).click();
  await page.getByRole("link", { name: missionName }).click();

  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  for (const mode of ["Satellite", "Hybride", "Carte"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.getByRole("button", { name: mode, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("IGN");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
