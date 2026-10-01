import type { DrawMode } from "../map/drawing";
import type { ToolMode } from "../map/useDrawing";
import { Button, type IconName } from "../ui/components";

const TOOLS: { mode: DrawMode; label: string; icon: IconName }[] = [
  { mode: "point", label: "Point", icon: "draw-point" },
  { mode: "linestring", label: "Ligne", icon: "draw-line" },
  { mode: "polygon", label: "Zone", icon: "draw-polygon" },
  { mode: "circle", label: "Cercle", icon: "crosshair" },
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
        <Button
          key={tool.mode}
          icon={tool.icon}
          aria-pressed={mode === tool.mode}
          disabled={disabled}
          onClick={() => onMode(tool.mode)}
        >
          {tool.label}
        </Button>
      ))}
      <Button icon="check" disabled={disabled} onClick={() => onMode("static")}>
        Terminer
      </Button>
    </div>
  );
}
