import type { MapMode } from "./mapModes";

const MODES: MapMode[] = ["Carte", "Satellite", "Hybride"];

export function ModeSwitch({
  mode,
  hasImagery,
  onMode,
}: {
  mode: MapMode;
  hasImagery: boolean;
  onMode: (mode: MapMode) => void;
}) {
  return (
    <div className="mode-switch" role="group" aria-label="Vue">
      {MODES.map((m) => (
        <button
          key={m}
          aria-pressed={mode === m}
          disabled={m !== "Carte" && !hasImagery}
          onClick={() => onMode(m)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
