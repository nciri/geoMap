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
  const menu = screen.getByRole("button", { name: /Paul Planificateur/ });
  expect(menu).toHaveTextContent("Planificateur");
  expect(menu).toHaveTextContent("PP");
  expect(menu).toHaveAttribute("aria-expanded", "false");
});

it("shows the administrator's entries", () => {
  session.roles = ["administrateur"];
  renderAt("/admin/fonds");
  expect(screen.getByRole("link", { name: "Terminaux" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Fonds de carte" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("button", { name: /Paul Planificateur/ })).toHaveTextContent(
    "Administrateur",
  );
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

it("keeps the theme and sign-out in the user menu, each with an icon", async () => {
  const user = userEvent.setup();
  renderAt("/");
  expect(screen.queryByRole("menu")).toBeNull();
  await user.click(screen.getByRole("button", { name: /Paul Planificateur/ }));
  const menu = screen.getByRole("menu");
  for (const item of menu.querySelectorAll("[role^=menuitem]")) {
    expect(item.querySelector("svg.al-icon")).not.toBeNull();
  }
  expect(within(menu).getByRole("menuitemradio", { name: "Système" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await user.click(within(menu).getByRole("menuitemradio", { name: "Nuit" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.queryByRole("menu")).toBeNull();

  await user.click(screen.getByRole("button", { name: /Paul Planificateur/ }));
  expect(screen.getByRole("menuitemradio", { name: "Nuit" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByRole("button", { name: /Paul Planificateur/ })).toHaveFocus();

  await user.click(screen.getByRole("button", { name: /Paul Planificateur/ }));
  await user.click(screen.getByRole("menuitem", { name: "Déconnexion" }));
  expect(session.signOut).toHaveBeenCalled();
  // Back to the system theme: the store is module state shared with the next tests.
  await user.click(screen.getByRole("button", { name: /Paul Planificateur/ }));
  await user.click(screen.getByRole("menuitemradio", { name: "Système" }));
});

it("moves through the menu with the arrow keys and closes on an outside click", async () => {
  const user = userEvent.setup();
  renderAt("/");
  await user.click(screen.getByRole("button", { name: /Paul Planificateur/ }));
  const items = [...screen.getByRole("menu").querySelectorAll("[role^=menuitem]")];
  expect(items[0]).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(items[1]).toHaveFocus();
  await user.keyboard("{ArrowUp}{ArrowUp}");
  expect(items.at(-1)).toHaveFocus();
  await user.click(screen.getByText("liste"));
  expect(screen.queryByRole("menu")).toBeNull();
});
