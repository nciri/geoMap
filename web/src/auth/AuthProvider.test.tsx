import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Mock } from "vitest";
import type { User } from "oidc-client-ts";
import { fakeToken } from "../test/tokens";
import { AuthProvider, RequireRole, useSession, type AuthManager } from "./AuthProvider";
import { getAccessToken, notifyUnauthorized, setAccessToken } from "./session";

const token = fakeToken({ realm_access: { roles: ["planificateur"] } });
const alice = {
  access_token: token,
  expired: false,
  profile: { sub: "u1", name: "Alice Martin" },
  state: undefined,
} as unknown as User;

type FakeManager = AuthManager & {
  signinRedirect: Mock;
  signinRedirectCallback: Mock;
  signoutRedirect: Mock;
};

function fakeManager(user: User | null, callbackUser: User = alice): FakeManager {
  return {
    getUser: vi.fn(async () => user),
    signinRedirect: vi.fn(async () => {}),
    signinRedirectCallback: vi.fn(async () => callbackUser),
    signoutRedirect: vi.fn(async () => {}),
    events: {
      addUserLoaded: vi.fn(),
      removeUserLoaded: vi.fn(),
      addSilentRenewError: vi.fn(),
      removeSilentRenewError: vi.fn(),
    },
  } as unknown as FakeManager;
}

function Whoami() {
  const { name, signOut } = useSession();
  return <button onClick={signOut}>{name}</button>;
}

afterEach(() => {
  setAccessToken(null);
  history.replaceState(null, "", "/");
});

it("sends an anonymous visitor to Keycloak and remembers the page", async () => {
  history.replaceState(null, "", "/missions/42?tab=objets");
  const manager = fakeManager(null);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(manager.signinRedirect).toHaveBeenCalledWith({
      state: { returnTo: "/missions/42?tab=objets" },
    }),
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("sends a visitor with an expired session to Keycloak", async () => {
  const manager = fakeManager({ ...alice, expired: true } as User);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await waitFor(() => expect(manager.signinRedirect).toHaveBeenCalled());
});

it("renders the app for a signed-in user and shares the token", async () => {
  const manager = fakeManager(alice);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  const whoami = await screen.findByRole("button", { name: "Alice Martin" });
  expect(getAccessToken()).toBe(token);
  await userEvent.click(whoami);
  expect(manager.signoutRedirect).toHaveBeenCalled();
});

it("forgets the token when signing out", async () => {
  const manager = fakeManager(alice);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await userEvent.click(await screen.findByRole("button", { name: "Alice Martin" }));
  expect(getAccessToken()).toBeNull();
});

it("completes the Keycloak callback and returns to the remembered page", async () => {
  history.replaceState(null, "", "/callback?code=abc&state=xyz");
  const manager = fakeManager(null, { ...alice, state: { returnTo: "/missions/42" } } as User);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await screen.findByRole("button", { name: "Alice Martin" });
  expect(manager.signinRedirectCallback).toHaveBeenCalled();
  expect(location.pathname).toBe("/missions/42");
});

it("never returns to another site after the callback", async () => {
  history.replaceState(null, "", "/callback?code=abc&state=xyz");
  const manager = fakeManager(null, { ...alice, state: { returnTo: "//evil.example/x" } } as User);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await screen.findByRole("button", { name: "Alice Martin" });
  expect(location.pathname).toBe("/");
});

it("never returns to another site through a backslash path", async () => {
  history.replaceState(null, "", "/callback?code=abc&state=xyz");
  const manager = fakeManager(null, { ...alice, state: { returnTo: "/\\evil.example/x" } } as User);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await screen.findByRole("button", { name: "Alice Martin" });
  expect(location.pathname).toBe("/");
});

it("signs in again when the API answers 401", async () => {
  const manager = fakeManager(alice);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await screen.findByRole("button", { name: "Alice Martin" });
  notifyUnauthorized();
  expect(manager.signinRedirect).toHaveBeenCalled();
});

it("signs in again when the silent token renewal fails", async () => {
  const manager = fakeManager(alice);
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await screen.findByRole("button", { name: "Alice Martin" });
  const [[renewFailed]] = (manager.events.addSilentRenewError as Mock).mock.calls;
  renewFailed(new Error("login_required"));
  expect(manager.signinRedirect).toHaveBeenCalled();
});

it("stops redirecting on 401 once unmounted", async () => {
  const manager = fakeManager(alice);
  const { unmount } = render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  await screen.findByRole("button", { name: "Alice Martin" });
  unmount();
  notifyUnauthorized();
  expect(manager.signinRedirect).not.toHaveBeenCalled();
  expect(manager.events.removeSilentRenewError).toHaveBeenCalledWith(
    (manager.events.addSilentRenewError as Mock).mock.calls[0][0],
  );
});

it("shows a sign-in failure instead of a blank page", async () => {
  history.replaceState(null, "", "/callback?error=access_denied");
  const manager = fakeManager(null);
  manager.signinRedirectCallback.mockRejectedValue(new Error("access_denied"));
  render(
    <AuthProvider manager={manager}>
      <Whoami />
    </AuthProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("access_denied");
  expect(screen.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/");
});

it("guards pages by role", async () => {
  render(
    <AuthProvider manager={fakeManager(alice)}>
      <RequireRole role="planificateur">
        <p>missions</p>
      </RequireRole>
      <RequireRole role="administrateur">
        <p>terminaux</p>
      </RequireRole>
    </AuthProvider>,
  );
  expect(await screen.findByText("missions")).toBeInTheDocument();
  expect(screen.queryByText("terminaux")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("administrateur");
});
