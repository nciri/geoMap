import type { DrawMode } from "../map/drawing";
import type { ToolMode } from "../map/useDrawing";

const TOOLS: { mode: DrawMode; label: string }[] = [
  { mode: "point", label: "Point" },
  { mode: "linestring", label: "Ligne" },
  { mode: "polygon", label: "Zone" },
  { mode: "circle", label: "Cercle" },
];

export function DrawToolbar({
  mode,
  onMode,
  disabled = false,
}: {
  mode: ToolMode;
  onMode: (mode: DrawMode | "static") => void;
  disabled?: boolean;
}) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Dessin">
      {TOOLS.map((tool) => (
        <button
          key={tool.mode}
          aria-pressed={mode === tool.mode}
          disabled={disabled}
          onClick={() => onMode(tool.mode)}
        >
          {tool.label}
        </button>
      ))}
      <button disabled={disabled} onClick={() => onMode("static")}>
        Terminer
      </button>
    </div>
  );
}
