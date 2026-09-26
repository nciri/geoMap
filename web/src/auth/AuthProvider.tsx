import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User, UserManager } from "oidc-client-ts";
import { rolesOf, type Role } from "./roles";
import { onUnauthorized, setAccessToken } from "./session";

export type AuthManager = Pick<
  UserManager,
  "getUser" | "signinRedirect" | "signinRedirectCallback" | "signoutRedirect" | "events"
>;

export interface Session {
  name: string;
  roles: Role[];
  signOut: () => void;
}

export const CALLBACK_PATH = "/callback";

const SessionContext = createContext<Session | null>(null);

function safeReturnPath(state: unknown): string {
  const returnTo = (state as { returnTo?: unknown } | undefined)?.returnTo;
  // "//host" is a protocol-relative URL to another site.
  return typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/";
}

export function AuthProvider({ manager, children }: { manager: AuthManager; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const signIn = () =>
      void manager.signinRedirect({ state: { returnTo: location.pathname + location.search } });
    const loaded = (next: User) => {
      setAccessToken(next.access_token);
      setUser(next);
    };
    onUnauthorized(signIn);
    manager.events.addUserLoaded(loaded);
    // An expired Keycloak session makes the silent renewal fail; the next API call would 401 anyway.
    manager.events.addSilentRenewError(signIn);
    (async () => {
      if (location.pathname === CALLBACK_PATH) {
        const signedIn = await manager.signinRedirectCallback();
        history.replaceState(null, "", safeReturnPath(signedIn.state));
        loaded(signedIn);
        return;
      }
      const current = await manager.getUser();
      if (current && !current.expired) loaded(current);
      else signIn();
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      onUnauthorized(() => {});
      manager.events.removeUserLoaded(loaded);
      manager.events.removeSilentRenewError(signIn);
    };
  }, [manager]);

  if (error) return <p role="alert">Connexion impossible : {error}</p>;
  if (!user) return <p>Connexion…</p>;
  const session: Session = {
    name: user.profile.name ?? user.profile.preferred_username ?? user.profile.sub,
    roles: rolesOf(user.access_token),
    signOut: () => void manager.signoutRedirect(),
  };
  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside AuthProvider");
  return session;
}

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { roles } = useSession();
  if (!roles.includes(role)) return <p role="alert">Accès réservé au rôle {role}.</p>;
  return children;
}
