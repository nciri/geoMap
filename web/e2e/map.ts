import type { Page } from "@playwright/test";

// Positions are fractions of the map canvas, so the journey does not depend on the window size.
export async function mapPoint(page: Page, fx: number, fy: number): Promise<void> {
  const box = (await page.locator("canvas.maplibregl-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

// Reads the API as the signed-in user, to check what the server stored.
export async function api<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (p) => {
    const key = Object.keys(sessionStorage).find((k) => k.startsWith("oidc.user:"))!;
    const token = (JSON.parse(sessionStorage.getItem(key)!) as { access_token: string })
      .access_token;
    const response = await fetch(p, { headers: { Authorization: `Bearer ${token}` } });
    return response.json();
  }, path) as Promise<T>;
}

type LngLat = [number, number];
const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

// Clicks a position once the editor has fitted the view to the mission's objects (MapView's
// fitBounds with 60 px padding): the drawing-time canvas fractions no longer apply after a reload.
export async function mapLngLat(
  page: Page,
  [[west, south], [east, north]]: [LngLat, LngLat],
  [lng, lat]: LngLat,
): Promise<void> {
  const box = (await page.locator("canvas.maplibregl-canvas").boundingBox())!;
  const scale = Math.min(
    (box.width - 120) / (mercX(east) - mercX(west)),
    (box.height - 120) / (mercY(south) - mercY(north)),
  );
  await page.mouse.click(
    box.x + box.width / 2 + (mercX(lng) - (mercX(west) + mercX(east)) / 2) * scale,
    box.y + box.height / 2 + (mercY(lat) - (mercY(south) + mercY(north)) / 2) * scale,
  );
}
