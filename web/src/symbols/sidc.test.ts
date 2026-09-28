import type { SymbolInfo } from "../api/geomap";
import {
  buildSidc,
  filledModifiers,
  groupByCategory,
  hasEchelon,
  modifierLabel,
  parseSidc,
  withIdentityAndEchelon,
} from "./sidc";

it("builds the verified infantry SIDCs", () => {
  expect(buildSidc("10121100", "3", "16")).toBe("10031000161211000000");
  expect(buildSidc("10121100", "6", "16")).toBe("10061000161211000000");
  expect(buildSidc("25140100", "3")).toBe("10032500001401000000");
});

it("reads identity, echelon and basic id back from a SIDC", () => {
  expect(parseSidc("10061000161211000000")).toEqual({
    basicId: "10121100",
    identity: "6",
    echelon: "16",
  });
});

it("splices identity and echelon into a SIDC, keeping every other digit", () => {
  // Context 1, status 1 (planned), HQ 2, modifiers 0102.
  expect(withIdentityAndEchelon("11031120161211000102", "6", "15")).toBe("11061120151211000102");
  expect(withIdentityAndEchelon("11031120161211000102", "5", null)).toBe("11051120161211000102");
});

it("offers an echelon for land units only", () => {
  expect(hasEchelon("10121100")).toBe(true);
  expect(hasEchelon("25140100")).toBe(false);
});

it("labels known modifiers in French and the others by letter", () => {
  expect(modifierLabel("T")).toBe("Désignation");
  expect(modifierLabel("AS")).toBe("Champ AS");
});

it("drops empty modifier values", () => {
  expect(filledModifiers({ T: "1ER RI", H: " ", W: "" })).toEqual({ T: "1ER RI" });
});

it("groups search results by top-level category, trimming names", () => {
  const symbol = (basicId: string, name: string, path: string): SymbolInfo => ({
    basicId,
    name,
    path,
    geometry: "POINT",
    minPoints: 1,
    maxPoints: 1,
    modifiers: [],
  });
  const groups = groupByCategory([
    symbol("10121100", "Infantry", "Land Unit / Movement and Maneuver"),
    symbol("27110101", "Infantry", "Dismounted Individuals / Military / Service Branch"),
    symbol("10121104", "Motorized ", "Land Unit / Movement and Maneuver / Infantry"),
  ]);
  expect(groups.map(([category, items]) => [category, items.map((s) => s.name)])).toEqual([
    ["Land Unit", ["Infantry", "Motorized"]],
    ["Dismounted Individuals", ["Infantry"]],
  ]);
});
