import { render, screen } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { routes } from "./App";

vi.mock("./Layout", () => ({ Layout: () => <Outlet /> }));
vi.mock("./auth/AuthProvider", () => ({
  RequireRole: ({ children }: { children: React.ReactNode }) => children,
}));
// Stands for a chunk that no longer exists on the server after a redeploy.
vi.mock("./editor/MissionEditorPage", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

it("explains in French when the editor cannot be loaded and offers a reload", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const router = createMemoryRouter(routes, { initialEntries: ["/missions/m1?x=1"] });
  render(<RouterProvider router={router} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de charger l'éditeur.");
  expect(screen.getByRole("link", { name: "Recharger" })).toHaveAttribute(
    "href",
    "/missions/m1?x=1",
  );
});
