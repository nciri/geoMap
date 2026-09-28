import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import type { Device } from "../api/geomap";
import { AssignmentPanel } from "./AssignmentPanel";

const missionId = "11111111-1111-4111-8111-111111111111";
const device = (id: string, name: string, overrides: Partial<Device> = {}): Device => ({
  id,
  name,
  certSha256: id.repeat(64),
  status: "ENROLLED",
  lastContact: "2026-09-28T09:00:00Z",
  createdAt: "2026-09-20T09:00:00Z",
  ...overrides,
});
const alpha = device("a", "Tablette Alpha");
const bravo = device("b", "Tablette Bravo", { lastContact: null });
const charlie = device("c", "Tablette Charlie", { status: "REVOKED" });

function serve(assigned: Device[] = [alpha]) {
  server.use(
    http.get("/api/devices", () => HttpResponse.json([alpha, bravo, charlie])),
    http.get(`/api/missions/${missionId}/devices`, () => HttpResponse.json(assigned)),
  );
}

it("shows every device with its assignment, status and last contact", async () => {
  serve();
  renderWithProviders(<AssignmentPanel missionId={missionId} disabled={false} />);
  expect(await screen.findByLabelText(/Tablette Alpha/)).toBeChecked();
  expect(screen.getByLabelText(/Tablette Bravo/)).not.toBeChecked();
  expect(screen.getByLabelText(/Tablette Charlie — révoqué/)).toBeDisabled();
  expect(screen.getAllByText(/2026-09-28 09:00Z/).length).toBeGreaterThan(0);
  expect(screen.getByText(/jamais/)).toBeInTheDocument();
});

it("saves the new assignment", async () => {
  serve();
  let body: unknown;
  server.use(
    http.put(`/api/missions/${missionId}/devices`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json([alpha, bravo]);
    }),
  );
  renderWithProviders(<AssignmentPanel missionId={missionId} disabled={false} />);
  const user = userEvent.setup();
  await user.click(await screen.findByLabelText(/Tablette Bravo/));
  await user.click(screen.getByRole("button", { name: "Enregistrer l'affectation" }));
  await waitFor(() => expect(body).toEqual({ deviceIds: ["a", "b"] }));
  expect(await screen.findByRole("status")).toHaveTextContent("Affectation enregistrée.");
});

it("shows the server's refusal", async () => {
  serve();
  server.use(
    http.put(`/api/missions/${missionId}/devices`, () =>
      HttpResponse.json({ status: 409, detail: "mission is withdrawn" }, { status: 409 }),
    ),
  );
  renderWithProviders(<AssignmentPanel missionId={missionId} disabled={false} />);
  await userEvent.click(await screen.findByRole("button", { name: "Enregistrer l'affectation" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("mission is withdrawn");
});

it("explains what to do when no device exists", async () => {
  server.use(
    http.get("/api/devices", () => HttpResponse.json([])),
    http.get(`/api/missions/${missionId}/devices`, () => HttpResponse.json([])),
  );
  renderWithProviders(<AssignmentPanel missionId={missionId} disabled={false} />);
  expect(
    await screen.findByText("Aucun terminal enregistré : demandez à un administrateur."),
  ).toBeInTheDocument();
});
