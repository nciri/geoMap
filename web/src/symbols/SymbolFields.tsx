import type { SymbolInfo } from "../api/geomap";
import { ECHELONS, hasEchelon, IDENTITIES, KNOWN_MODIFIERS, modifierLabel } from "./sidc";

export interface SymbolChoice {
  identity: string;
  echelon: string;
  modifiers: Record<string, string>;
}

interface Props extends SymbolChoice {
  symbol: SymbolInfo;
  onChange: (choice: SymbolChoice) => void;
}

export function SymbolFields({ symbol, identity, echelon, modifiers, onChange }: Props) {
  // mil-sym's modifier lists occasionally carry blank entries.
  const keys = symbol.modifiers.filter((key) => key.trim() !== "");
  const known = KNOWN_MODIFIERS.filter((key) => keys.includes(key));
  const others = keys.filter((key) => !KNOWN_MODIFIERS.includes(key));
  const change = (patch: Partial<SymbolChoice>) =>
    onChange({ identity, echelon, modifiers, ...patch });
  const field = (key: string) => (
    <label key={key}>
      {modifierLabel(key)}
      <input
        value={modifiers[key] ?? ""}
        onChange={(e) => change({ modifiers: { ...modifiers, [key]: e.target.value } })}
      />
    </label>
  );

  return (
    <div className="symbol-fields">
      <label>
        Identité
        <select value={identity} onChange={(e) => change({ identity: e.target.value })}>
          {IDENTITIES.map((i) => (
            <option key={i.code} value={i.code}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
      {hasEchelon(symbol.basicId) && (
        <label>
          Échelon
          <select value={echelon} onChange={(e) => change({ echelon: e.target.value })}>
            {ECHELONS.map((e) => (
              <option key={e.code} value={e.code}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {known.map(field)}
      {others.length > 0 && (
        <details open={known.length === 0}>
          <summary>Autres champs</summary>
          {others.map(field)}
        </details>
      )}
    </div>
  );
}
