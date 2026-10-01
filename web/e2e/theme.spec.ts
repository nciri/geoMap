import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { chooseTheme, signIn, userMenu } from "./helpers";
import { mapPoint } from "./map";

test.describe.configure({ mode: "serial" });
const suffix = randomBytes(3).toString("hex");

test("an administrator imports a basemap for the theme journey", async ({ page }) => {
  await signIn(page, "admin");
  await page.getByRole("link", { name: "Fonds de carte" }).click();
  await page.getByLabel("Identifiant").fill(`theme-${suffix}`);
  await page.getByLabel("Nom").fill(`Thème ${suffix}`);
  await page.getByLabel("Fichier PMTiles").setInputFiles({
    name: "theme.pmtiles",
    mimeType: "application/octet-stream",
    buffer: readFileSync("e2e/fixtures/vector.pmtiles"),
  });
  await page.getByRole("button", { name: "Importer" }).click();
  await expect(page.getByRole("status")).toContainText(`Thème ${suffix}`);
});

test("a planner switches theme while editing and the map stays where it was", async ({ page }) => {
  await signIn(page, "planner");
  await chooseTheme(page, "Nuit");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Nouvelle mission" }).click();
  await page.getByLabel("Nom").fill(`Op Thème ${suffix}`);
  await page.getByLabel("Fond de carte").selectOption({ label: `Thème ${suffix}` });
  await page.getByRole("button", { name: "Créer la mission" }).click();
  await page.getByRole("link", { name: `Op Thème ${suffix}` }).click();
  await expect(page.getByRole("button", { name: "Zone", exact: true })).toBeEnabled();
  await expect(page.locator(".maplibregl-ctrl-scale")).not.toContainText("km");

  await page.getByRole("button", { name: "Point", exact: true }).click();
  await mapPoint(page, 0.5, 0.5);
  await expect(page.getByRole("button", { name: /Sans nom.*Point/ })).toBeVisible();
  const scale = await page.locator(".maplibregl-ctrl-scale").textContent();

  // Reshaping the point when the theme changes.
  await page.getByRole("button", { name: /Sans nom.*Point/ }).click();
  await expect(page.getByLabel("Nom de l'objet")).toBeVisible();
  await chooseTheme(page, "Jour");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Zone", exact: true })).toBeEnabled();
  await expect(page.locator(".maplibregl-ctrl-scale")).toHaveText(scale!);
  await expect(page.getByRole("button", { name: /Sans nom.*Point/ })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  // The rebuilt map drops the reshape handles; drawing starts again from the toolbar.
  await page.getByRole("button", { name: "Zone", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zone", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await chooseTheme(page, "Nuit");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await userMenu(page).click();
  await expect(page.getByRole("menuitemradio", { name: "Nuit" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
