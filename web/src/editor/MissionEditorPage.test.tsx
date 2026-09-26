import { screen, waitFor } from "@testing-library/react";
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

const id = "11111111-1111-4111-8111-111111111111";
const route = { route: `/missions/${id}`, path: "/missions/:missionId" };

function serve(current = mission(), features = [feature()]) {
  server.use(
    http.get(`/api/missions/${id}`, () => HttpResponse.json(current)),
    http.get(`/api/missions/${id}/features`, () => HttpResponse.json(features)),
    http.get("/api/basemaps", () => HttpResponse.json([basemap()])),
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
