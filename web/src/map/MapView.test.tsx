import { render, screen } from "@testing-library/react";
import { MapView } from "./MapView";

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
    tile() {}
    add() {}
  },
  FetchSource: class {},
  PMTiles: class {
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
