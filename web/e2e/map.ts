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
type Bounds = [LngLat, LngLat];
export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

// The union of the objects' boxes, as the editor's boundsOf computes it.
export function boundsOf(boxes: BBox[]): Bounds {
  return [
    [Math.min(...boxes.map((b) => b.minLon)), Math.min(...boxes.map((b) => b.minLat))],
    [Math.max(...boxes.map((b) => b.maxLon)), Math.max(...boxes.map((b) => b.maxLat))],
  ];
}

// MapView.tsx fits a reopened mission with fitBounds(bounds, { padding: 60, maxZoom: 15 }).
const FIT_PADDING = 60;
const FIT_MAX_ZOOM = 15;
// MapLibre's world is 512 px wide at zoom 0.
const WORLD_PX = 512;

const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

// Clicks a position once the editor has fitted the view to the mission's objects: the
// drawing-time canvas fractions no longer apply after a reload.
export async function mapLngLat(
  page: Page,
  [[west, south], [east, north]]: Bounds,
  [lng, lat]: LngLat,
): Promise<void> {
  const box = (await page.locator("canvas.maplibregl-canvas").boundingBox())!;
  const scale = Math.min(
    (box.width - 2 * FIT_PADDING) / (mercX(east) - mercX(west)),
    (box.height - 2 * FIT_PADDING) / (mercY(south) - mercY(north)),
    WORLD_PX * 2 ** FIT_MAX_ZOOM,
  );
  await page.mouse.click(
    box.x + box.width / 2 + (mercX(lng) - (mercX(west) + mercX(east)) / 2) * scale,
    box.y + box.height / 2 + (mercY(lat) - (mercY(south) + mercY(north)) / 2) * scale,
  );
}
