import { render, screen, waitFor } from "@testing-library/react";
import { MapView } from "./MapView";

const pmtiles = vi.hoisted(() => ({ tiles: new Map<string, unknown>() }));
const layout = vi.hoisted(() => ({ calls: new Map<string, string>() }));
interface FakeMap {
  options: { style: { sprite: string }; center?: unknown; zoom?: number };
  view: { center: [number, number]; zoom: number; bearing: number; pitch: number };
  removed: boolean;
  fitBoundsCalls: unknown[];
}
const maps = vi.hoisted(() => ({ created: [] as FakeMap[] }));

vi.mock("maplibre-gl", () => ({
  addProtocol: vi.fn(),
  setWorkerUrl: vi.fn(),
  Map: class {
    view = { center: [2.35, 46.6] as [number, number], zoom: 5, bearing: 0, pitch: 0 };
    removed = false;
    fitBoundsCalls: unknown[] = [];
    constructor(public options: FakeMap["options"]) {
      maps.created.push(this);
    }
    on(event: string, callback: () => void) {
      if (event === "load") queueMicrotask(callback);
    }
    addControl() {}
    fitBounds(bounds: unknown) {
      this.fitBoundsCalls.push(bounds);
    }
    getCenter() {
      return { toArray: () => this.view.center };
    }
    getZoom() {
      return this.view.zoom;
    }
    getBearing() {
      return this.view.bearing;
    }
    getPitch() {
      return this.view.pitch;
    }
    remove() {
      this.removed = true;
    }
    setLayoutProperty(id: string, _property: string, value: string) {
      layout.calls.set(id, value);
    }
  },
  NavigationControl: class {},
  ScaleControl: class {},
}));

vi.mock("pmtiles", () => ({
  Protocol: class {
    tiles = pmtiles.tiles;
    tile() {}
    add(p: { source: { getKey(): string } }) {
      this.tiles.set(p.source.getKey(), p);
    }
  },
  FetchSource: class {
    constructor(public url: string) {}
    getKey() {
      return this.url;
    }
  },
  PMTiles: class {
    constructor(public source: unknown) {}
    getHeader() {
      return Promise.reject(new Error("Bad response code: 404"));
    }
  },
}));

const vector = { id: "zone-nord", name: "Zone Nord", attribution: "© OpenStreetMap" };
const paris = { id: "paris-ortho", name: "Paris", attribution: "© IGN" };

it("explains an unreadable basemap in French and keeps the technical cause in the title", async () => {
  render(<MapView vector={vector} imagery={[]} mode="Carte" theme="light" />);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Fond de carte illisible : le serveur ne l'a pas fourni.");
  expect(alert).not.toHaveTextContent("Bad response code");
  expect(alert).toHaveAttribute("title", "Bad response code: 404");
});

it("names each unreadable imagery layer", async () => {
  render(<MapView vector={null} imagery={[paris]} mode="Satellite" theme="light" />);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Imagerie illisible : Paris");
  expect(alert).toHaveAttribute("title", "Bad response code: 404");
});

it("releases every archive when the map goes away", async () => {
  const { unmount } = render(
    <MapView vector={vector} imagery={[paris]} mode="Carte" theme="light" />,
  );
  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
  expect(pmtiles.tiles.size).toBe(2);
  unmount();
  expect(pmtiles.tiles.size).toBe(0);
});

it("switches only the style's layers between views", async () => {
  layout.calls.clear();
  const { rerender } = render(
    <MapView vector={vector} imagery={[paris]} mode="Carte" theme="light" />,
  );
  await waitFor(() => expect(layout.calls.get("imagery-paris-ortho")).toBe("none"));
  expect(layout.calls.get("places_locality")).toBe("visible");
  rerender(<MapView vector={vector} imagery={[paris]} mode="Satellite" theme="light" />);
  await waitFor(() => expect(layout.calls.get("imagery-paris-ortho")).toBe("visible"));
  expect(layout.calls.get("places_locality")).toBe("none");
  expect(layout.calls.get("water")).toBe("visible");
  expect([...layout.calls.keys()].some((id) => id.startsWith("mission"))).toBe(false);
  await screen.findAllByRole("alert");
});

it("rebuilds the map at the same view when the theme changes", () => {
  const { rerender } = render(<MapView vector={vector} imagery={[]} mode="Carte" theme="light" />);
  const first = maps.created.at(-1)!;
  first.view = { center: [2.3, 48.8], zoom: 13, bearing: 20, pitch: 0 };
  rerender(<MapView vector={vector} imagery={[]} mode="Carte" theme="dark" />);
  expect(first.removed).toBe(true);
  const second = maps.created.at(-1)!;
  expect(second).not.toBe(first);
  expect(second.options).toMatchObject({ center: [2.3, 48.8], zoom: 13, bearing: 20, pitch: 0 });
  expect(second.options.style.sprite).toMatch(/sprites\/v4\/dark$/);
  expect(second.fitBoundsCalls).toHaveLength(0);
});

it("shows each unreadable layer once after a theme rebuild", async () => {
  const { rerender } = render(
    <MapView vector={null} imagery={[paris]} mode="Satellite" theme="light" />,
  );
  await screen.findByRole("alert");
  rerender(<MapView vector={null} imagery={[paris]} mode="Satellite" theme="dark" />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});

it("tells its owner when the map goes away, so tools wait for the next one", () => {
  const onRemoved = vi.fn();
  const { rerender } = render(
    <MapView vector={vector} imagery={[]} mode="Carte" theme="light" onRemoved={onRemoved} />,
  );
  expect(onRemoved).not.toHaveBeenCalled();
  rerender(
    <MapView vector={vector} imagery={[]} mode="Carte" theme="dark" onRemoved={onRemoved} />,
  );
  expect(onRemoved).toHaveBeenCalledTimes(1);
});
