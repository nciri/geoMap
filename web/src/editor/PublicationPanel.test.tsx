import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { mission } from "../test/fixtures";
import type { PublicationView, ValidationReport } from "../api/geomap";
import { PublicationPanel } from "./PublicationPanel";
import { saveFile } from "../files";

vi.mock("../files", () => ({ saveFile: vi.fn() }));

const id = "11111111-1111-4111-8111-111111111111";
const base = `/api/missions/${id}`;
const v1: PublicationView = {
  missionId: id,
  version: 1,
  sha256: "c".repeat(64),
  sizeBytes: 12_288,
  recipients: 2,
  publishedBy: "alice",
  publishedAt: "2026-09-28T10:00:00Z",
};

function serve(report: ValidationReport, versions: PublicationView[] = []) {
  server.use(
    http.get(`${base}/validation`, () => HttpResponse.json(report)),
    http.get(`${base}/versions`, () => HttpResponse.json(versions)),
  );
}

function panel(overrides = {}, onSelectFeature = vi.fn()) {
  renderWithProviders(
    <PublicationPanel
      mission={mission(overrides)}
      revision="r1"
      onSelectFeature={onSelectFeature}
    />,
  );
  return onSelectFeature;
}

it("lists blocking errors in French, links them to their object and blocks publication", async () => {
  serve({
    errors: [
      { code: "NO_RECIPIENT", message: "no enrolled device", featureId: null },
      { code: "SYMBOL_NOT_RENDERABLE", message: "cannot render", featureId: "f1" },
    ],
    warnings: [{ code: "PENDING_SUGGESTIONS", message: "1 pending", featureId: null }],
  });
  const onSelectFeature = panel();
  expect(await screen.findByText("Aucun terminal enrôlé affecté")).toBeInTheDocument();
  expect(screen.getByText("Suggestions IA en attente")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Publier/ })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Symbole impossible à afficher" }));
  expect(onSelectFeature).toHaveBeenCalledWith("f1");
});

it("publishes a valid mission and shows the new version", async () => {
  serve({ errors: [], warnings: [] });
  server.use(
    http.post(`${base}/publish`, () => {
      serve({ errors: [], warnings: [] }, [v1]);
      return HttpResponse.json(v1, { status: 201 });
    }),
  );
  panel();
  expect(await screen.findByText("Aucune erreur bloquante.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Publier la version 1" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Version 1 publiée pour 2 terminaux.",
  );
  const history = await screen.findByRole("list", { name: "Versions publiées" });
  expect(
    within(history).getByText(/v1 — 2026-09-28 10:00Z par alice — 2 terminaux — 12 Ko/),
  ).toBeInTheDocument();
});

it("shows the server's refusal when publishing fails", async () => {
  serve({ errors: [], warnings: [] });
  server.use(
    http.post(`${base}/publish`, () =>
      HttpResponse.json(
        { status: 409, detail: "mission is not publishable: NO_RECIPIENT" },
        { status: 409 },
      ),
    ),
  );
  panel();
  await userEvent.click(await screen.findByRole("button", { name: "Publier la version 1" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "mission is not publishable: NO_RECIPIENT",
  );
});

it("exports the latest package for an SD card", async () => {
  serve({ errors: [], warnings: [] }, [v1]);
  server.use(
    http.get(`${base}/package`, () =>
      HttpResponse.arrayBuffer(new Uint8Array([71, 77, 80, 49]).buffer, {
        headers: { "Content-Disposition": `attachment; filename="${id}-v1.gmp"` },
      }),
    ),
  );
  panel({ status: "PUBLISHED" });
  await userEvent.click(await screen.findByRole("button", { name: "Exporter pour carte SD" }));
  await waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), `${id}-v1.gmp`));
});

it("withdraws a published mission only after confirmation", async () => {
  serve({ errors: [], warnings: [] }, [v1]);
  const withdrawn = vi.fn();
  server.use(
    http.post(`${base}/withdraw`, () => {
      withdrawn();
      return HttpResponse.json(mission({ status: "WITHDRAWN" }));
    }),
  );
  panel({ status: "PUBLISHED" });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Retirer la mission" }));
  expect(withdrawn).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirmer le retrait" }));
  await waitFor(() => expect(withdrawn).toHaveBeenCalled());
});

it("offers neither publication nor export once withdrawn", async () => {
  serve({ errors: [], warnings: [] }, [v1]);
  panel({ status: "WITHDRAWN" });
  expect(
    await screen.findByText("Mission retirée : les terminaux la suppriment au prochain contact."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Publier/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Exporter pour carte SD" })).not.toBeInTheDocument();
});
