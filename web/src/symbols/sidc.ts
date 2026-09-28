import type { SymbolGeometry, SymbolInfo } from "../api/geomap";

export const IDENTITIES = [
  { code: "3", label: "Ami" },
  { code: "6", label: "Hostile" },
  { code: "4", label: "Neutre" },
  { code: "1", label: "Inconnu" },
  { code: "2", label: "Ami présumé" },
  { code: "5", label: "Suspect" },
];

export const ECHELONS = [
  { code: "00", label: "—" },
  { code: "11", label: "Équipe" },
  { code: "12", label: "Groupe" },
  { code: "13", label: "Demi-section" },
  { code: "14", label: "Section" },
  { code: "15", label: "Compagnie" },
  { code: "16", label: "Bataillon" },
  { code: "17", label: "Régiment" },
  { code: "18", label: "Brigade" },
  { code: "21", label: "Division" },
  { code: "22", label: "Corps d'armée" },
  { code: "23", label: "Armée" },
];

export const KNOWN_MODIFIERS = ["T", "H", "W"];

const MODIFIER_LABELS: Record<string, string> = {
  T: "Désignation",
  H: "Informations complémentaires",
  W: "Date-heure",
};

export const GEOMETRY_LABELS: Record<SymbolGeometry, string> = {
  POINT: "Point",
  LINE: "Ligne",
  AREA: "Zone",
};

// 20 digits: version 10, context 0 (reality), identity, symbol set, status 0, HQ/TF/dummy 0,
// echelon, entity, modifiers 1 and 2.
export function buildSidc(basicId: string, identity: string, echelon = "00"): string {
  return `100${identity}${basicId.slice(0, 2)}00${echelon}${basicId.slice(2)}0000`;
}

export function parseSidc(sidc: string): { basicId: string; identity: string; echelon: string } {
  return {
    basicId: sidc.slice(4, 6) + sidc.slice(10, 16),
    identity: sidc.charAt(3),
    echelon: sidc.slice(8, 10),
  };
}

export const hasEchelon = (basicId: string) => basicId.startsWith("10");

export const modifierLabel = (key: string) => MODIFIER_LABELS[key] ?? `Champ ${key}`;

export const filledModifiers = (modifiers: Record<string, string>) =>
  Object.fromEntries(Object.entries(modifiers).filter(([, value]) => value.trim() !== ""));

export function groupByCategory(symbols: SymbolInfo[]): [string, SymbolInfo[]][] {
  const groups = new Map<string, SymbolInfo[]>();
  for (const symbol of symbols) {
    const category = symbol.path.split(" / ")[0];
    // mil-sym names sometimes carry a trailing space.
    groups.set(category, [
      ...(groups.get(category) ?? []),
      { ...symbol, name: symbol.name.trim() },
    ]);
  }
  return [...groups];
}
