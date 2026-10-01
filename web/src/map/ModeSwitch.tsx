import { MapPanel } from "../ui/components";
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
    <MapPanel className="map-mode">
      <div className="al-modeswitch" role="group" aria-label="Vue">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            disabled={m !== "Carte" && !hasImagery}
            onClick={() => onMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
    </MapPanel>
  );
}
