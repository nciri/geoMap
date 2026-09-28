import { expect, test } from "./fixtures";
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
