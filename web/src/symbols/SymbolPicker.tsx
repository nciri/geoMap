import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchSymbols, type SymbolInfo } from "../api/geomap";
import { errorMessage } from "../api/client";
import { buildSidc, filledModifiers, GEOMETRY_LABELS, groupByCategory, hasEchelon } from "./sidc";
import { SymbolFields, type SymbolChoice } from "./SymbolFields";
import { SymbolIcon } from "./SymbolIcon";
import { Alert, Button, Icon } from "../ui/components";

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
      <label className="search-field">
        Rechercher un symbole
        <span className="search-field__box">
          <Icon name="search" size={16} />
          <input
            value={query}
            placeholder="infantry, artillery…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </span>
      </label>
      {results.error && <Alert severity="error" title={errorMessage(results.error)} />}
      {groupByCategory(results.data ?? []).map(([category, symbols]) => (
        <details key={category} open className="symbol-group">
          <summary>{category}</summary>
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
        </details>
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
          <Button icon="symbol" onClick={() => onPlace({ symbol, sidc, modifiers })}>
            Placer sur la carte
          </Button>
        </div>
      )}
    </section>
  );
}
