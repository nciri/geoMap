import { fakeToken } from "../test/tokens";
import { rolesOf } from "./roles";

it("keeps the geoMap realm roles only", () => {
  const token = fakeToken({ realm_access: { roles: ["offline_access", "planificateur"] } });
  expect(rolesOf(token)).toEqual(["planificateur"]);
});

it("decodes claims containing non-ASCII text", () => {
  const token = fakeToken({ name: "Général Émile", realm_access: { roles: ["administrateur"] } });
  expect(rolesOf(token)).toEqual(["administrateur"]);
});

it("returns no role for a token without realm roles or a malformed token", () => {
  expect(rolesOf(fakeToken({ sub: "u1" }))).toEqual([]);
  expect(rolesOf("not-a-jwt")).toEqual([]);
});
