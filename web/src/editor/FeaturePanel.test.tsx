import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { feature } from "../test/fixtures";
import type { Feature } from "../api/geomap";
import { DEFAULT_COLOR } from "../map/missionLayer";
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

it("refuses a second save while one is in flight, so an older one cannot land last", async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  server.use(
    http.put(`${path}/c1`, async () => {
      calls += 1;
      await held;
      return HttpResponse.json(circle);
    }),
  );
  panel("c1");
  const user = userEvent.setup();
  const save = await screen.findByRole("button", { name: "Enregistrer l'objet" });
  await user.click(save);
  await waitFor(() => expect(save).toBeDisabled());
  await user.click(save);
  release();
  await waitFor(() => expect(save).toBeEnabled());
  expect(calls).toBe(1);
});

it("sets a circle's radius from the panel and keeps its centre", async () => {
  let body: Partial<Feature> | undefined;
  server.use(
    http.put(`${path}/c1`, async ({ request }) => {
      body = (await request.json()) as Partial<Feature>;
      return HttpResponse.json(circle);
    }),
  );
  panel("c1");
  const user = userEvent.setup();
  const radius = await screen.findByLabelText("Rayon (m)");
  expect(radius).toHaveAttribute("min", "1");
  expect(radius).toHaveAttribute("step", "1");
  await user.clear(radius);
  await user.type(radius, "1250");
  await user.click(screen.getByRole("button", { name: "Enregistrer l'objet" }));
  await waitFor(() =>
    expect(body).toMatchObject({
      geometry: circle.geometry,
      style: { color: "#40a02b", radiusMeters: 1250 },
    }),
  );
});

it("offers no radius for objects that are not circles", async () => {
  panel("s1");
  await screen.findByLabelText("Nom de l'objet");
  expect(screen.queryByLabelText("Rayon (m)")).not.toBeInTheDocument();
});

it("keeps a drawn circle's exact radius when only renaming it", async () => {
  let body: Partial<Feature> | undefined;
  const drawn = feature({ id: "c2", name: "Cercle", style: { radiusMeters: 1234.5 } });
  server.use(
    http.get(path, () => HttpResponse.json([])),
    http.put(`${path}/c2`, async ({ request }) => {
      body = (await request.json()) as Partial<Feature>;
      return HttpResponse.json(drawn);
    }),
  );
  renderWithProviders(
    <FeaturePanel missionId={missionId} features={[drawn]} selectedId="c2" onSelect={vi.fn()} />,
  );
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Nom de l'objet"), " Alpha");
  await user.click(screen.getByRole("button", { name: "Enregistrer l'objet" }));
  await waitFor(() => expect(body?.style).toEqual({ radiusMeters: 1234.5, color: DEFAULT_COLOR }));
});

it("changes an APP-6D object's identity and designation, keeping its geometry", async () => {
  const unit = feature({
    id: "u1",
    name: "1ER RI",
    kind: "APP6",
    sidc: "10031000161211000000",
    modifiers: { T: "1ER RI" },
  });
  let body: Partial<Feature> | undefined;
  server.use(
    http.get("/api/symbols/10031000161211000000", () =>
      HttpResponse.json({
        basicId: "10121100",
        name: "Infantry",
        path: "Land Unit / Movement and Maneuver",
        geometry: "POINT",
        minPoints: 1,
        maxPoints: 1,
        modifiers: ["T", "H"],
      }),
    ),
    http.get("/api/symbols/:sidc/icon.png", () =>
      HttpResponse.arrayBuffer(new Uint8Array([1]).buffer, {
        headers: { "X-Anchor-X": "1", "X-Anchor-Y": "1" },
      }),
    ),
    http.put(`${path}/u1`, async ({ request }) => {
      body = (await request.json()) as Partial<Feature>;
      return HttpResponse.json(unit);
    }),
    http.get(path, () => HttpResponse.json([])),
  );
  renderWithProviders(
    <FeaturePanel missionId={missionId} features={[unit]} selectedId="u1" onSelect={vi.fn()} />,
  );
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText("Identité"), "6");
  const designation = screen.getByLabelText("Désignation");
  await user.clear(designation);
  await user.type(designation, "2E RI");
  await user.click(screen.getByRole("button", { name: "Enregistrer l'objet" }));
  await waitFor(() =>
    expect(body).toMatchObject({
      kind: "APP6",
      geometry: unit.geometry,
      sidc: "10061000161211000000",
      modifiers: { T: "2E RI" },
    }),
  );
});

it("keeps an APP-6D object's stored SIDC when only its name changes", async () => {
  // Status "planned" (digit 7) and a headquarters flag (digit 8), which the form does not edit.
  const unit = feature({ id: "u2", kind: "APP6", sidc: "10031120161211000000", modifiers: null });
  let body: Partial<Feature> | undefined;
  server.use(
    http.get("/api/symbols/10031120161211000000", () =>
      HttpResponse.json({
        basicId: "10121100",
        name: "Infantry",
        path: "Land Unit / Movement and Maneuver",
        geometry: "LINE",
        minPoints: 2,
        maxPoints: 2,
        modifiers: [],
      }),
    ),
    http.put(`${path}/u2`, async ({ request }) => {
      body = (await request.json()) as Partial<Feature>;
      return HttpResponse.json(unit);
    }),
    http.get(path, () => HttpResponse.json([])),
  );
  renderWithProviders(
    <FeaturePanel missionId={missionId} features={[unit]} selectedId="u2" onSelect={vi.fn()} />,
  );
  const user = userEvent.setup();
  await screen.findByLabelText("Identité");
  await user.type(screen.getByLabelText("Nom de l'objet"), " bis");
  await user.click(screen.getByRole("button", { name: "Enregistrer l'objet" }));
  await waitFor(() =>
    expect(body).toMatchObject({ kind: "APP6", sidc: "10031120161211000000", modifiers: {} }),
  );
});

it("changes identity and echelon without touching the SIDC's other digits", async () => {
  // Context, status, HQ and modifier digits the form does not edit.
  const stored = "11031120161211000102";
  const unit = feature({ id: "u3", kind: "APP6", sidc: stored, modifiers: null });
  let body: Partial<Feature> | undefined;
  const previewed: string[] = [];
  server.use(
    http.get(`/api/symbols/${stored}`, () =>
      HttpResponse.json({
        basicId: "10121100",
        name: "Infantry",
        path: "Land Unit / Movement and Maneuver",
        geometry: "POINT",
        minPoints: 1,
        maxPoints: 1,
        modifiers: [],
      }),
    ),
    http.get("/api/symbols/:sidc/icon.png", ({ params }) => {
      previewed.push(String(params.sidc));
      return HttpResponse.arrayBuffer(new Uint8Array([1]).buffer, {
        headers: { "X-Anchor-X": "1", "X-Anchor-Y": "1" },
      });
    }),
    http.put(`${path}/u3`, async ({ request }) => {
      body = (await request.json()) as Partial<Feature>;
      return HttpResponse.json(unit);
    }),
    http.get(path, () => HttpResponse.json([])),
  );
  renderWithProviders(
    <FeaturePanel missionId={missionId} features={[unit]} selectedId="u3" onSelect={vi.fn()} />,
  );
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText("Identité"), "6");
  await user.selectOptions(screen.getByLabelText("Échelon"), "15");
  await user.click(screen.getByRole("button", { name: "Enregistrer l'objet" }));
  await waitFor(() => expect(body).toMatchObject({ sidc: "11061120151211000102" }));
  expect(previewed[0]).toBe(stored);
});
