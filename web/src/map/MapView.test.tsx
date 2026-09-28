import { render, screen } from "@testing-library/react";
import { MapView } from "./MapView";

const pmtiles = vi.hoisted(() => ({ tiles: new Map<string, unknown>() }));

vi.mock("maplibre-gl", () => ({
  addProtocol: vi.fn(),
  Map: class {
    on() {}
    addControl() {}
    fitBounds() {}
    remove() {}
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

it("explains an unreadable basemap in French and keeps the technical cause in the title", async () => {
  render(<MapView basemapId="b1" />);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Fond de carte illisible : le serveur ne l'a pas fourni.");
  expect(alert).not.toHaveTextContent("Bad response code");
  expect(alert).toHaveAttribute("title", "Bad response code: 404");
});

it("releases the basemap archive when the map goes away", async () => {
  const { unmount } = render(<MapView basemapId="b1" />);
  await screen.findByRole("alert");
  expect(pmtiles.tiles.size).toBe(1);
  unmount();
  expect(pmtiles.tiles.size).toBe(0);
});
