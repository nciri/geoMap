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
  await expect(userMenu(page)).toBeVisible();
}

// The header's user menu: its button is named after the signed-in user and their role.
export function userMenu(page: Page) {
  return page.getByRole("button", { name: /Planificateur|Administrateur/ });
}

export async function chooseTheme(page: Page, theme: "Jour" | "Nuit" | "Système") {
  await userMenu(page).click();
  await page.getByRole("menuitemradio", { name: theme }).click();
}
