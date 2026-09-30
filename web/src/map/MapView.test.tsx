import { render, screen, waitFor } from "@testing-library/react";
import { MapView } from "./MapView";

const pmtiles = vi.hoisted(() => ({ tiles: new Map<string, unknown>() }));
const layout = vi.hoisted(() => ({ calls: new Map<string, string>() }));

vi.mock("maplibre-gl", () => ({
  addProtocol: vi.fn(),
  setWorkerUrl: vi.fn(),
  Map: class {
    on(event: string, callback: () => void) {
      if (event === "load") queueMicrotask(callback);
    }
    addControl() {}
    fitBounds() {}
    remove() {}
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
  render(<MapView vector={vector} imagery={[]} mode="Carte" />);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Fond de carte illisible : le serveur ne l'a pas fourni.");
  expect(alert).not.toHaveTextContent("Bad response code");
  expect(alert).toHaveAttribute("title", "Bad response code: 404");
});

it("names each unreadable imagery layer", async () => {
  render(<MapView vector={null} imagery={[paris]} mode="Satellite" />);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Imagerie illisible : Paris");
  expect(alert).toHaveAttribute("title", "Bad response code: 404");
});

it("releases every archive when the map goes away", async () => {
  const { unmount } = render(<MapView vector={vector} imagery={[paris]} mode="Carte" />);
  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
  expect(pmtiles.tiles.size).toBe(2);
  unmount();
  expect(pmtiles.tiles.size).toBe(0);
});

it("switches only the style's layers between views", async () => {
  layout.calls.clear();
  const { rerender } = render(<MapView vector={vector} imagery={[paris]} mode="Carte" />);
  await waitFor(() => expect(layout.calls.get("imagery-paris-ortho")).toBe("none"));
  expect(layout.calls.get("places_locality")).toBe("visible");
  rerender(<MapView vector={vector} imagery={[paris]} mode="Satellite" />);
  await waitFor(() => expect(layout.calls.get("imagery-paris-ortho")).toBe("visible"));
  expect(layout.calls.get("places_locality")).toBe("none");
  expect(layout.calls.get("water")).toBe("visible");
  expect([...layout.calls.keys()].some((id) => id.startsWith("mission"))).toBe(false);
  await screen.findAllByRole("alert");
});
