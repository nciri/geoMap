import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchSymbols, type SymbolInfo } from "../api/geomap";
import { errorMessage } from "../api/client";
import { buildSidc, filledModifiers, GEOMETRY_LABELS, groupByCategory, hasEchelon } from "./sidc";
import { SymbolFields, type SymbolChoice } from "./SymbolFields";
import { SymbolIcon } from "./SymbolIcon";

export interface PlacedSymbol {
  symbol: SymbolInfo;
  sidc: string;
  modifiers: Record<string, string>;
}

const FRESH: SymbolChoice = { identity: "3", echelon: "00", modifiers: {} };

export function SymbolPicker({ onPlace }: { onPlace: (placed: PlacedSymbol) => void }) {
  const [query, setQuery] = useState("");
  const [symbol, setSymbol] = useState<SymbolInfo | null>(null);
  const [choice, setChoice] = useState<SymbolChoice>(FRESH);
  const results = useQuery({
    queryKey: ["symbols", query],
    queryFn: () => searchSymbols(query),
    enabled: query.trim().length >= 2,
  });
  const sidc = symbol
    ? buildSidc(symbol.basicId, choice.identity, hasEchelon(symbol.basicId) ? choice.echelon : "00")
    : null;
  const modifiers = filledModifiers(choice.modifiers);

  return (
    <section className="symbol-picker">
      <label>
        Rechercher un symbole
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {results.error && <p role="alert">{errorMessage(results.error)}</p>}
      {groupByCategory(results.data ?? []).map(([category, symbols]) => (
        <div key={category}>
          <h3>{category}</h3>
          {symbols.map((s) => (
            <button
              key={s.basicId}
              className={s.basicId === symbol?.basicId ? "selected" : undefined}
              onClick={() => {
                setSymbol(s);
                setChoice(FRESH);
              }}
            >
              {s.name} <small>{s.path}</small>
            </button>
          ))}
        </div>
      ))}
      {symbol && sidc && (
        <div className="symbol-choice">
          <p>
            <strong>{symbol.name.trim()}</strong> · {GEOMETRY_LABELS[symbol.geometry]}
            {symbol.geometry !== "POINT" && ` · ${symbol.minPoints} à ${symbol.maxPoints} points`}
          </p>
          <SymbolFields symbol={symbol} {...choice} onChange={setChoice} />
          {symbol.geometry === "POINT" && (
            <SymbolIcon sidc={sidc} modifiers={modifiers} alt={`Aperçu ${symbol.name.trim()}`} />
          )}
          <button onClick={() => onPlace({ symbol, sidc, modifiers })}>Placer sur la carte</button>
        </div>
      )}
    </section>
  );
}
