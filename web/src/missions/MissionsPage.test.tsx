import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { basemap, mission } from "../test/fixtures";
import { MissionsPage } from "./MissionsPage";

function serve(missions = [mission(), mission({ id: "m2", name: "Op Sud", status: "PUBLISHED" })]) {
  server.use(
    http.get("/api/missions", () => HttpResponse.json(missions)),
    http.get("/api/basemaps", () => HttpResponse.json([basemap()])),
  );
}

const rowOf = async (name: string) => (await screen.findByRole("link", { name })).closest("tr")!;

it("lists missions with their status and UTC dates", async () => {
  serve();
  renderWithProviders(<MissionsPage />);
  const row = await rowOf("Op Nord");
  expect(within(row).getByText("Brouillon")).toBeInTheDocument();
  expect(within(row).getByText("2026-10-02 06:00Z")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Op Nord" })).toHaveAttribute(
    "href",
    "/missions/11111111-1111-4111-8111-111111111111",
  );
  expect(screen.getByText("Publiée")).toBeInTheDocument();
});

it("creates a mission with a basemap and a UTC expiry", async () => {
  serve([]);
  let body: unknown;
  server.use(
    http.post("/api/missions", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(mission(), { status: 201 });
    }),
  );
  renderWithProviders(<MissionsPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nom"), "  Op Nord ");
  await screen.findByRole("option", { name: "Zone Nord" });
  await user.selectOptions(screen.getByLabelText("Fond de carte"), "zone-nord");
  await user.type(screen.getByLabelText("Valide jusqu'au (UTC)"), "2026-10-02T06:00");
  serve();
  await user.click(screen.getByRole("button", { name: "Créer la mission" }));
  await waitFor(() =>
    expect(body).toEqual({
      name: "Op Nord",
      layers: ["zone-nord"],
      validUntil: "2026-10-02T06:00:00Z",
    }),
  );
  expect(await screen.findByRole("link", { name: "Op Nord" })).toBeInTheDocument();
  expect(screen.getByLabelText("Nom")).toHaveValue("");
  expect(screen.getByLabelText("Fond de carte")).toHaveDisplayValue("— aucun —");
  expect(screen.getByLabelText("Valide jusqu'au (UTC)")).toHaveValue("");
});

it("deletes a draft only after confirmation", async () => {
  serve();
  const deleted = vi.fn();
  server.use(
    http.delete("/api/missions/:id", ({ params }) => {
      deleted(params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderWithProviders(<MissionsPage />);
  const user = userEvent.setup();
  const draftRow = await rowOf("Op Nord");
  const publishedRow = await rowOf("Op Sud");
  expect(within(publishedRow).queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
  await user.click(within(draftRow).getByRole("button", { name: "Supprimer" }));
  expect(deleted).not.toHaveBeenCalled();
  await user.click(within(draftRow).getByRole("button", { name: "Confirmer la suppression" }));
  await waitFor(() => expect(deleted).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111"));
});

it("shows the server's reason when a deletion is refused", async () => {
  serve();
  server.use(
    http.delete("/api/missions/:id", () =>
      HttpResponse.json(
        { status: 409, detail: "a published mission cannot be deleted; withdraw it instead" },
        { status: 409 },
      ),
    ),
  );
  renderWithProviders(<MissionsPage />);
  const user = userEvent.setup();
  const row = await rowOf("Op Nord");
  await user.click(within(row).getByRole("button", { name: "Supprimer" }));
  await user.click(within(row).getByRole("button", { name: "Confirmer la suppression" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "a published mission cannot be deleted; withdraw it instead",
  );
  expect(within(row).getByRole("button", { name: "Confirmer la suppression" })).toBeInTheDocument();
  expect(within(row).getByRole("button", { name: "Annuler" })).toBeInTheDocument();
});

it("shows the server's reason when a creation is refused", async () => {
  serve([]);
  server.use(
    http.post("/api/missions", () =>
      HttpResponse.json({ status: 400, detail: "name must not be blank" }, { status: 400 }),
    ),
  );
  renderWithProviders(<MissionsPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nom"), "x");
  await user.click(screen.getByRole("button", { name: "Créer la mission" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("name must not be blank");
});
