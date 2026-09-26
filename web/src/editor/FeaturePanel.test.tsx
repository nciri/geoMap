import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { feature } from "../test/fixtures";
import type { Feature } from "../api/geomap";
import { FeaturePanel } from "./FeaturePanel";

const missionId = "11111111-1111-4111-8111-111111111111";
const path = `/api/missions/${missionId}/features`;

const circle = feature({
  id: "c1",
  name: "Zone de poser",
  style: { color: "#40a02b", radiusMeters: 800 },
});
const suggestion = feature({
  id: "s1",
  name: "Point d'appui proposé",
  origin: "AI_SUGGESTED",
  suggestionStatus: "PENDING",
  geometry: {
    type: "LineString",
    coordinates: [
      [2, 48],
      [2.1, 48.1],
    ],
  },
});
const rejected = feature({
  id: "r1",
  name: "Rejeté",
  origin: "AI_SUGGESTED",
  suggestionStatus: "REJECTED",
});
const symbol = feature({ id: "a1", name: "", kind: "APP6", sidc: "10031000001211000000" });

function panel(selectedId: string | null = null, onSelect = vi.fn()) {
  server.use(http.get(path, () => HttpResponse.json([])));
  renderWithProviders(
    <FeaturePanel
      missionId={missionId}
      features={[circle, suggestion, rejected, symbol]}
      selectedId={selectedId}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

it("lists visible objects with their type and marks AI suggestions", async () => {
  panel();
  expect(await screen.findByRole("button", { name: /Zone de poser.*Cercle/ })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Point d'appui proposé.*Ligne.*Suggestion IA/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Sans nom.*APP-6D 10031000001211000000/ }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Rejeté")).not.toBeInTheDocument();
});

it("selects an object from the list", async () => {
  const onSelect = panel();
  await userEvent.click(await screen.findByRole("button", { name: /Zone de poser/ }));
  expect(onSelect).toHaveBeenCalledWith(circle);
});

it("accepts or rejects a pending suggestion", async () => {
  const calls: string[] = [];
  server.use(
    http.post(`${path}/:id/:decision`, ({ params }) => {
      calls.push(`${params.id} ${params.decision}`);
      return HttpResponse.json(suggestion);
    }),
  );
  panel();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Accepter Point d'appui proposé" }));
  await user.click(screen.getByRole("button", { name: "Rejeter Point d'appui proposé" }));
  await waitFor(() => expect(calls).toEqual(["s1 accept", "s1 reject"]));
});

it("renames and recolours an object without touching its geometry or radius", async () => {
  let body: Partial<Feature> | undefined;
  server.use(
    http.put(`${path}/c1`, async ({ request }) => {
      body = (await request.json()) as Partial<Feature>;
      return HttpResponse.json(circle);
    }),
  );
  panel("c1");
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Nom de l'objet");
  await user.clear(name);
  await user.type(name, "Zone de poser Alpha");
  await user.type(screen.getByLabelText("Description"), "hélicoptères");
  await user.click(screen.getByRole("button", { name: "Enregistrer l'objet" }));
  await waitFor(() =>
    expect(body).toEqual({
      kind: "GENERIC",
      geometry: circle.geometry,
      name: "Zone de poser Alpha",
      description: "hélicoptères",
      style: { color: "#40a02b", radiusMeters: 800 },
      sidc: null,
      modifiers: null,
    }),
  );
});

it("deletes an object only after confirmation and clears the selection", async () => {
  const deleted = vi.fn();
  server.use(
    http.delete(`${path}/c1`, () => {
      deleted();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const onSelect = panel("c1");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Supprimer l'objet" }));
  expect(deleted).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));
  await waitFor(() => expect(deleted).toHaveBeenCalled());
  expect(onSelect).toHaveBeenCalledWith(null);
});

it("shows the server's reason when a change is refused", async () => {
  server.use(
    http.put(`${path}/c1`, () =>
      HttpResponse.json(
        { status: 409, detail: "a withdrawn mission cannot be edited" },
        { status: 409 },
      ),
    ),
  );
  panel("c1");
  await userEvent.click(await screen.findByRole("button", { name: "Enregistrer l'objet" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "a withdrawn mission cannot be edited",
  );
});
