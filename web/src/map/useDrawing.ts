import { useCallback, useEffect, useRef, useState } from "react";
import type * as maplibregl from "maplibre-gl";
import {
  TerraDraw,
  TerraDrawCircleMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { Feature } from "../api/geomap";
import { toDrawFeature, type DrawMode } from "./drawing";

export type ToolMode = DrawMode | "select" | "static";

const RESHAPE = {
  draggable: true,
  coordinates: { draggable: true, deletable: true, midpoints: true },
};

const SELECT_FLAGS = {
  point: { feature: { draggable: true } },
  linestring: { feature: RESHAPE },
  polygon: { feature: RESHAPE },
  // "center" scales x and y independently and would turn the circle into an ellipse.
  circle: { feature: { draggable: true, coordinates: { resizable: "center-fixed" as const } } },
};

interface Handlers {
  onCreate: (drawn: GeoJSONStoreFeatures) => void;
  onChange: (featureId: string, drawn: GeoJSONStoreFeatures) => void;
}

export function useDrawing(map: maplibregl.Map | null, handlers: Handlers) {
  const drawRef = useRef<TerraDraw | null>(null);
  const handlersRef = useRef(handlers);
  const [mode, setModeState] = useState<ToolMode>("static");

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!map) return;
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawPointMode(),
        new TerraDrawLineStringMode(),
        new TerraDrawPolygonMode(),
        new TerraDrawCircleMode(),
        new TerraDrawSelectMode({ flags: SELECT_FLAGS }),
      ],
    });
    draw.start();
    draw.on("finish", (id, context) => {
      const drawn = draw.getSnapshotFeature(id);
      if (!drawn) return;
      if (context.action === "draw") {
        // The saved copy comes back from the server and is shown by the mission layer.
        draw.removeFeatures([id]);
        handlersRef.current.onCreate(drawn);
      } else {
        handlersRef.current.onChange(String(id), drawn);
      }
    });
    drawRef.current = draw;
    return () => {
      draw.stop();
      drawRef.current = null;
    };
  }, [map]);

  const setMode = useCallback((next: DrawMode | "static") => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.clear();
    draw.setMode(next);
    setModeState(next);
  }, []);

  const edit = useCallback((feature: Feature): string | null => {
    const draw = drawRef.current;
    const editable = toDrawFeature(feature);
    if (!draw) return "Carte non prête.";
    if (!editable) return "Seuls les objets génériques se modifient sur la carte.";
    draw.clear();
    const [result] = draw.addFeatures([editable]);
    if (!result?.valid) return `Géométrie non modifiable : ${result?.reason ?? "invalide"}`;
    draw.setMode("select");
    draw.selectFeature(feature.id);
    setModeState("select");
    return null;
  }, []);

  const stopEditing = useCallback(() => setMode("static"), [setMode]);

  return { mode, setMode, edit, stopEditing };
}
