import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/render";
import type { SymbolInfo } from "../api/geomap";
import { SymbolPicker } from "./SymbolPicker";

const infantry: SymbolInfo = {
  basicId: "10121100",
  name: "Infantry",
  path: "Land Unit / Movement and Maneuver",
  geometry: "POINT",
  minPoints: 1,
  maxPoints: 1,
  modifiers: ["T", "H", "AS"],
};
const flot: SymbolInfo = {
  basicId: "25140100",
  name: "Forward Line of Own Troops",
  path: "Control Measure / Command and Control Lines",
  geometry: "LINE",
  minPoints: 2,
  maxPoints: 50,
  modifiers: ["N"],
};

function serve() {
  const iconRequests: string[] = [];
  server.use(
    http.get("/api/symbols", ({ request }) => {
      const q = new URL(request.url).searchParams.get("q");
      return HttpResponse.json(q === "infantry" ? [infantry] : [flot]);
    }),
    http.get("/api/symbols/:sidc/icon.png", ({ params }) => {
      iconRequests.push(String(params.sidc));
      return HttpResponse.arrayBuffer(new Uint8Array([1]).buffer, {
        headers: { "X-Anchor-X": "10", "X-Anchor-Y": "10" },
      });
    }),
  );
  return iconRequests;
}

it("finds a unit, builds its SIDC from identity and echelon, and places it", async () => {
  const iconRequests = serve();
  const onPlace = vi.fn();
  renderWithProviders(<SymbolPicker onPlace={onPlace} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Rechercher un symbole"), "infantry");
  await user.click(await screen.findByRole("button", { name: /Infantry/ }));
  expect(screen.getByText("Land Unit", { selector: "summary" })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Identité"), "6");
  await user.selectOptions(screen.getByLabelText("Échelon"), "16");
  await user.type(screen.getByLabelText("Désignation"), "1ER RI");
  await waitFor(() => expect(iconRequests).toContain("10061000161211000000"));
  await user.click(screen.getByRole("button", { name: "Placer sur la carte" }));
  expect(onPlace).toHaveBeenCalledWith({
    symbol: infantry,
    sidc: "10061000161211000000",
    modifiers: { T: "1ER RI" },
  });
});

it("offers no echelon for a control measure and shows other fields by letter", async () => {
  serve();
  renderWithProviders(<SymbolPicker onPlace={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Rechercher un symbole"), "ligne");
  await user.click(await screen.findByRole("button", { name: /Forward Line of Own Troops/ }));
  expect(screen.queryByLabelText("Échelon")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Champ N")).toBeInTheDocument();
  expect(screen.getByText(/Ligne · 2 à 50 points/)).toBeInTheDocument();
});

it("shows the server's reason when the search fails", async () => {
  server.use(
    http.get("/api/symbols", () =>
      HttpResponse.json(
        { status: 400, detail: "limit must be between 1 and 100" },
        { status: 400 },
      ),
    ),
  );
  renderWithProviders(<SymbolPicker onPlace={vi.fn()} />);
  await userEvent.type(screen.getByLabelText("Rechercher un symbole"), "xx");
  expect(await screen.findByRole("alert")).toHaveTextContent("limit must be between 1 and 100");
});
