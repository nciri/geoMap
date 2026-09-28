import { act, screen, waitFor } from "@testing-library/react";
import type { GeoJSONStoreFeatures } from "terra-draw";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { basemap, feature, mission } from "../test/fixtures";
import { MissionEditorPage } from "./MissionEditorPage";

vi.mock("../map/MapView", () => ({
  MapView: (props: { basemapId: string | null; initialBounds?: unknown }) => (
    <div
      data-testid="map"
      data-basemap={props.basemapId ?? ""}
      data-bounds={JSON.stringify(props.initialBounds ?? null)}
    />
  ),
}));

// The map never loads in jsdom, so Terra Draw's finish events are fed to the page's handlers directly.
const drawing = vi.hoisted(() => ({
  handlers: null as null | {
    onCreate: (drawn: unknown) => void;
    onChange: (featureId: string, drawn: unknown) => void;
  },
  edit: vi.fn(() => null),
  stopEditing: vi.fn(),
}));
vi.mock("../map/useDrawing", () => ({
  useDrawing: (_map: unknown, handlers: typeof drawing.handlers) => {
    drawing.handlers = handlers;
    return {
      mode: "select",
      setMode: vi.fn(),
      edit: drawing.edit,
      stopEditing: drawing.stopEditing,
    };
  },
}));

const collapsedCircle = {
  type: "Feature",
  id: "td-1",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [2, 48],
        [2, 48],
        [2, 48],
        [2, 48],
      ],
    ],
  },
  properties: { mode: "circle" },
} as GeoJSONStoreFeatures;

const id = "11111111-1111-4111-8111-111111111111";
const route = { route: `/missions/${id}`, path: "/missions/:missionId" };

function serve(current = mission(), features = [feature()]) {
  server.use(
    http.get(`/api/missions/${id}`, () => HttpResponse.json(current)),
    http.get(`/api/missions/${id}/features`, () => HttpResponse.json(features)),
    http.get("/api/basemaps", () => HttpResponse.json([basemap()])),
    http.get(`/api/missions/${id}/validation`, () =>
      HttpResponse.json({ errors: [], warnings: [] }),
    ),
    http.get(`/api/missions/${id}/versions`, () => HttpResponse.json([])),
    http.get("/api/devices", () => HttpResponse.json([])),
    http.get(`/api/missions/${id}/devices`, () => HttpResponse.json([])),
  );
}

it("opens the mission on its basemap, framed on its objects", async () => {
  serve();
  renderWithProviders(<MissionEditorPage />, route);
  expect(await screen.findByRole("heading", { name: "Op Nord" })).toBeInTheDocument();
  expect(screen.getByText("Brouillon")).toBeInTheDocument();
  const map = screen.getByTestId("map");
  expect(map).toHaveAttribute("data-basemap", "zone-nord");
  expect(map).toHaveAttribute(
    "data-bounds",
    JSON.stringify([
      [2.35, 48.85],
      [2.35, 48.85],
    ]),
  );
});

it("still opens a mission without a basemap and says what to do", async () => {
  serve(mission({ basemapId: null }), []);
  renderWithProviders(<MissionEditorPage />, route);
  expect(await screen.findByRole("status")).toHaveTextContent("Aucun fond de carte");
  expect(screen.getByTestId("map")).toHaveAttribute("data-basemap", "");
});

it("saves mission settings", async () => {
  serve();
  let patch: unknown;
  server.use(
    http.patch(`/api/missions/${id}`, async ({ request }) => {
      patch = await request.json();
      return HttpResponse.json(mission({ name: "Op Nord 2" }));
    }),
  );
  renderWithProviders(<MissionEditorPage />, route);
  const user = userEvent.setup();
  await user.click(await screen.findByText("Paramètres"));
  await screen.findByRole("option", { name: "Zone Nord" });
  const name = screen.getByLabelText("Nom");
  await user.clear(name);
  await user.type(name, "Op Nord 2");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() =>
    expect(patch).toEqual({
      name: "Op Nord 2",
      basemapId: "zone-nord",
      validUntil: "2026-10-02T06:00:00Z",
    }),
  );
});

it("reports a mission that cannot be loaded", async () => {
  server.use(
    http.get(`/api/missions/${id}`, () =>
      HttpResponse.json({ status: 404, detail: "mission not found" }, { status: 404 }),
    ),
    http.get(`/api/missions/${id}/features`, () => HttpResponse.json([])),
  );
  renderWithProviders(<MissionEditorPage />, route);
  expect(await screen.findByRole("alert")).toHaveTextContent("mission not found");
});

it("reports a drawn shape that cannot be saved instead of losing it", async () => {
  serve();
  renderWithProviders(<MissionEditorPage />, route);
  await screen.findByRole("heading", { name: "Op Nord" });
  act(() => drawing.handlers!.onCreate(collapsedCircle));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Forme invalide : un cercle demande au moins trois sommets distincts.",
  );
});

it("puts the saved shape back when a reshape cannot be saved", async () => {
  const saved = feature({ style: { radiusMeters: 500 } });
  serve(mission(), [saved]);
  renderWithProviders(<MissionEditorPage />, route);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /PC avancé/ }));
  drawing.edit.mockClear();
  act(() => drawing.handlers!.onChange(saved.id, collapsedCircle));
  expect(screen.getByRole("alert")).toHaveTextContent("Forme invalide");
  expect(drawing.edit).toHaveBeenCalledWith(saved);
});

it("says so when the reshaped object was deleted meanwhile", async () => {
  serve();
  renderWithProviders(<MissionEditorPage />, route);
  await screen.findByRole("heading", { name: "Op Nord" });
  drawing.stopEditing.mockClear();
  act(() => drawing.handlers!.onChange("gone", collapsedCircle));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Cet objet n'existe plus : il a été supprimé entre-temps.",
  );
  expect(drawing.stopEditing).toHaveBeenCalled();
});
