import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Layout } from "./Layout";

const session = { name: "Paul Planificateur", roles: ["planificateur"], signOut: vi.fn() };
vi.mock("./auth/AuthProvider", () => ({ useSession: () => session }));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <Layout />,
        children: [
          { path: "/", element: <p>liste</p> },
          { path: "/missions/:id", element: <p>éditeur</p> },
          { path: "/admin/terminaux", element: <p>terminaux</p> },
          { path: "/admin/fonds", element: <p>fonds</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  localStorage.clear();
  session.roles = ["planificateur"];
});

it("shows the planner's entries, the page title and who is signed in", () => {
  renderAt("/");
  const nav = screen.getByRole("navigation", { name: "Navigation principale" });
  expect(within(nav).getByRole("link", { name: "Missions" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(within(nav).queryByRole("link", { name: "Terminaux" })).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Missions" })).toBeInTheDocument();
  expect(screen.getByText("Paul Planificateur")).toBeInTheDocument();
  expect(screen.getByText("Planificateur")).toBeInTheDocument();
  expect(screen.getByText("PP")).toBeInTheDocument();
});

it("shows the administrator's entries", () => {
  session.roles = ["administrateur"];
  renderAt("/admin/fonds");
  expect(screen.getByRole("link", { name: "Terminaux" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Fonds de carte" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByText("Administrateur")).toBeInTheDocument();
});

it("collapses in the editor but keeps the links' names", async () => {
  renderAt("/missions/42");
  const nav = screen.getByRole("navigation", { name: "Navigation principale" });
  expect(nav).toHaveClass("al-sidebar--collapsed");
  expect(within(nav).getByRole("link", { name: "Missions" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Déplier" }));
  expect(nav).not.toHaveClass("al-sidebar--collapsed");
  expect(localStorage.getItem("geomap.sidebar.editor")).toBe("expanded");
});

it("switches the theme and signs out", async () => {
  renderAt("/");
  await userEvent.click(screen.getByRole("button", { name: "Nuit" }));
  expect(screen.getByRole("button", { name: "Nuit" })).toHaveAttribute("aria-pressed", "true");
  expect(document.documentElement.dataset.theme).toBe("dark");
  await userEvent.click(screen.getByRole("button", { name: "Déconnexion" }));
  expect(session.signOut).toHaveBeenCalled();
});
