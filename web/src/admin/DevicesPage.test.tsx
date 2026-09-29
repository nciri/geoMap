import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import type { Device } from "../api/geomap";
import { DevicesPage } from "./DevicesPage";

const alpha: Device = {
  id: "a",
  name: "Tablette Alpha",
  certSha256: "ab".repeat(32),
  status: "ENROLLED",
  lastContact: null,
  createdAt: "2026-09-20T09:00:00Z",
};

it("registers a device with its fingerprint and encryption key", async () => {
  server.use(http.get("/api/devices", () => HttpResponse.json([])));
  let body: unknown;
  server.use(
    http.post("/api/devices", async ({ request }) => {
      body = await request.json();
      server.use(http.get("/api/devices", () => HttpResponse.json([alpha])));
      return HttpResponse.json(alpha, { status: 201 });
    }),
  );
  renderWithProviders(<DevicesPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nom"), "Tablette Alpha");
  await user.type(screen.getByLabelText("Empreinte du certificat (SHA-256)"), "ab".repeat(32));
  await user.type(
    screen.getByLabelText("Clé publique de chiffrement (PEM)"),
    "-----BEGIN PUBLIC KEY-----",
  );
  await user.click(screen.getByRole("button", { name: "Enregistrer le terminal" }));
  await waitFor(() =>
    expect(body).toEqual({
      name: "Tablette Alpha",
      certSha256: "ab".repeat(32),
      encryptionPublicKeyPem: "-----BEGIN PUBLIC KEY-----",
    }),
  );
  expect(await screen.findByText("Tablette Alpha")).toBeInTheDocument();
});

it("revokes an enrolled device after confirmation", async () => {
  server.use(http.get("/api/devices", () => HttpResponse.json([alpha])));
  const revoked = vi.fn();
  server.use(
    http.post("/api/devices/a/revoke", () => {
      revoked();
      return HttpResponse.json({ ...alpha, status: "REVOKED" });
    }),
  );
  renderWithProviders(<DevicesPage />);
  const user = userEvent.setup();
  const row = (await screen.findByText("Tablette Alpha")).closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "Révoquer" }));
  expect(revoked).not.toHaveBeenCalled();
  await user.click(within(row).getByRole("button", { name: "Confirmer la révocation" }));
  await waitFor(() => expect(revoked).toHaveBeenCalled());
});

it("shows the server's refusal", async () => {
  server.use(
    http.get("/api/devices", () => HttpResponse.json([])),
    http.post("/api/devices", () =>
      HttpResponse.json(
        { status: 400, detail: "certSha256 must be 64 lowercase hex characters" },
        { status: 400 },
      ),
    ),
  );
  renderWithProviders(<DevicesPage />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nom"), "x");
  await user.type(screen.getByLabelText("Empreinte du certificat (SHA-256)"), "zz");
  await user.type(screen.getByLabelText("Clé publique de chiffrement (PEM)"), "k");
  await user.click(screen.getByRole("button", { name: "Enregistrer le terminal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "certSha256 must be 64 lowercase hex characters",
  );
});
