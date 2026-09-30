import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { basemap, mission } from "../test/fixtures";
import { MissionForm } from "./MissionForm";

const vector = basemap({ id: "zone-nord", name: "Zone Nord", kind: "VECTOR" });
const paris = basemap({
  id: "paris-ortho",
  name: "Paris ortho",
  kind: "RASTER",
  attribution: "© IGN",
});
const lyon = basemap({
  id: "lyon-ortho",
  name: "Lyon ortho",
  kind: "RASTER",
  attribution: "© IGN",
});

function serve() {
  server.use(http.get("/api/basemaps", () => HttpResponse.json([vector, paris, lyon])));
}

it("stacks imagery under the vector basemap in the chosen order", async () => {
  serve();
  const onSubmit = vi.fn(async () => {});
  renderWithProviders(
    <MissionForm
      initial={mission({ layers: ["zone-nord"] })}
      submitLabel="Enregistrer"
      onSubmit={onSubmit}
    />,
  );
  const user = userEvent.setup();
  await screen.findByRole("option", { name: "Paris ortho" });
  await user.selectOptions(screen.getByLabelText("Ajouter une imagerie"), "paris-ortho");
  await user.selectOptions(screen.getByLabelText("Ajouter une imagerie"), "lyon-ortho");
  expect(screen.getAllByText(/© IGN/).length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Monter Lyon ortho" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ layers: ["zone-nord", "lyon-ortho", "paris-ortho"] }),
    ),
  );
});

it("offers only vector basemaps as the base and only imagery as layers", async () => {
  serve();
  renderWithProviders(<MissionForm submitLabel="Créer la mission" onSubmit={vi.fn()} />);
  await screen.findByRole("option", { name: "Zone Nord" });
  expect(screen.getByLabelText("Fond de carte")).not.toHaveTextContent("Paris ortho");
  expect(screen.getByLabelText("Ajouter une imagerie")).not.toHaveTextContent("Zone Nord");
});

it("removes an imagery layer", async () => {
  serve();
  const onSubmit = vi.fn(async () => {});
  renderWithProviders(
    <MissionForm
      initial={mission({ layers: ["zone-nord", "paris-ortho"] })}
      submitLabel="Enregistrer"
      onSubmit={onSubmit}
    />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Retirer Paris ortho" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ layers: ["zone-nord"] })),
  );
});
