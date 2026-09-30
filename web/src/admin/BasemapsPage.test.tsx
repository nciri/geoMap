import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import { basemap } from "../test/fixtures";
import { BasemapsPage } from "./BasemapsPage";

it("lists basemaps with their size in MB", async () => {
  server.use(
    http.get("/api/basemaps", () => HttpResponse.json([basemap({ sizeBytes: 250 * 1024 * 1024 })])),
  );
  renderWithProviders(<BasemapsPage />);
  expect(await screen.findByText("Zone Nord")).toBeInTheDocument();
  expect(screen.getByText("250 Mo")).toBeInTheDocument();
});

it("uploads a PMTiles file under an id and a name", async () => {
  server.use(http.get("/api/basemaps", () => HttpResponse.json([])));
  let seen: unknown;
  server.use(
    http.put("/api/basemaps/zone-sud", async ({ request }) => {
      seen = {
        name: new URL(request.url).searchParams.get("name"),
        size: (await request.arrayBuffer()).byteLength,
      };
      return HttpResponse.json(basemap({ id: "zone-sud", name: "Zone Sud" }), { status: 201 });
    }),
  );
  renderWithProviders(<BasemapsPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Identifiant"), "zone-sud");
  await user.type(screen.getByLabelText("Nom"), "Zone Sud");
  await user.upload(
    screen.getByLabelText("Fichier PMTiles"),
    new File([new Uint8Array(5)], "zone-sud.pmtiles"),
  );
  // jsdom never recomputes a required file input's validity from `.files`, so a real click on the
  // submit button would be blocked by native constraint validation even with a file selected;
  // dispatch the submit event directly, bypassing that jsdom-only quirk.
  fireEvent.submit(screen.getByLabelText("Identifiant").closest("form")!);
  await waitFor(() => expect(seen).toEqual({ name: "Zone Sud", size: 5 }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Fond de carte « Zone Sud » importé.",
  );
  expect(screen.getByLabelText("Identifiant")).toHaveValue("");
  expect(screen.getByLabelText("Nom")).toHaveValue("");
  expect((screen.getByLabelText("Fichier PMTiles") as HTMLInputElement).files).toHaveLength(0);
});

it("shows the server's refusal", async () => {
  server.use(
    http.get("/api/basemaps", () => HttpResponse.json([])),
    http.put("/api/basemaps/zone-nord", () =>
      HttpResponse.json(
        { status: 409, detail: "basemap zone-nord already exists" },
        { status: 409 },
      ),
    ),
  );
  renderWithProviders(<BasemapsPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Identifiant"), "zone-nord");
  await user.type(screen.getByLabelText("Nom"), "Zone Nord");
  await user.upload(
    screen.getByLabelText("Fichier PMTiles"),
    new File([new Uint8Array(1)], "a.pmtiles"),
  );
  fireEvent.submit(screen.getByLabelText("Identifiant").closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("basemap zone-nord already exists");
});

it("shows each basemap's type and attribution", async () => {
  server.use(
    http.get("/api/basemaps", () =>
      HttpResponse.json([
        basemap({ kind: "VECTOR", attribution: "&copy; OpenStreetMap" }),
        basemap({ id: "paris-ortho", name: "Paris ortho", kind: "RASTER", attribution: "© IGN" }),
      ]),
    ),
  );
  renderWithProviders(<BasemapsPage />);
  expect(await screen.findByText("Imagerie")).toBeInTheDocument();
  expect(screen.getByText("Vectoriel")).toBeInTheDocument();
  expect(screen.getByText("© IGN")).toBeInTheDocument();
  expect(screen.getByText("© OpenStreetMap")).toBeInTheDocument();
});

it("refuses to submit without a file", async () => {
  server.use(http.get("/api/basemaps", () => HttpResponse.json([])));
  renderWithProviders(<BasemapsPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Identifiant"), "zone-est");
  await user.type(screen.getByLabelText("Nom"), "Zone Est");
  fireEvent.submit(screen.getByLabelText("Identifiant").closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Sélectionnez un fichier PMTiles.");
});
