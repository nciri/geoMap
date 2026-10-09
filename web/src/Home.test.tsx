import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { User } from "oidc-client-ts";
import { http, HttpResponse } from "msw";
import { server } from "./test/server";
import { fakeToken } from "./test/tokens";
import { AuthProvider, type AuthManager } from "./auth/AuthProvider";
import { Home } from "./Home";

function renderAs(roles: string[]) {
  const user = {
    access_token: fakeToken({ realm_access: { roles } }),
    expired: false,
    profile: { sub: "u", name: "Utilisateur" },
  } as unknown as User;
  const noop = () => {};
  const manager = {
    getUser: async () => user,
    signinRedirect: async () => {},
    signinRedirectCallback: async () => user,
    signoutRedirect: async () => {},
    events: {
      addUserLoaded: noop,
      removeUserLoaded: noop,
      addSilentRenewError: noop,
      removeSilentRenewError: noop,
    },
  } as unknown as AuthManager;
  const router = createMemoryRouter(
    [
      { path: "/", element: <Home /> },
      { path: "/admin/terminaux", element: <p>page terminaux</p> },
    ],
    { initialEntries: ["/"] },
  );
  render(
    <AuthProvider manager={manager}>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthProvider>,
  );
}

it("sends an administrator without the planner role to the device page", async () => {
  renderAs(["administrateur"]);
  expect(await screen.findByText("page terminaux")).toBeInTheDocument();
});

it("shows planners their missions", async () => {
  server.use(
    http.get("/api/missions", () => HttpResponse.json([])),
    http.get("/api/basemaps", () => HttpResponse.json([])),
  );
  renderAs(["planificateur", "administrateur"]);
  expect(await screen.findByRole("button", { name: "Nouvelle mission" })).toBeInTheDocument();
});

it("refuses a user with neither role", async () => {
  renderAs([]);
  expect(await screen.findByRole("alert")).toHaveTextContent("planificateur");
});
