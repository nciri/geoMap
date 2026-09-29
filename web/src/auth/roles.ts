export type Role = "planificateur" | "administrateur";

const KNOWN_ROLES: readonly Role[] = ["planificateur", "administrateur"];

export function rolesOf(accessToken: string): Role[] {
  try {
    const payload = accessToken.split(".")[1] ?? "";
    const base64 = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as {
      realm_access?: { roles?: unknown };
    };
    const roles = claims.realm_access?.roles;
    return Array.isArray(roles) ? KNOWN_ROLES.filter((role) => roles.includes(role)) : [];
  } catch {
    return [];
  }
}
