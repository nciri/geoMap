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
  // Select mode resizes circles in Mercator space and deforms them; the radius is set in the panel.
  circle: { feature: { draggable: true } },
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
        // Geodesic, like circlePolygon: the default Mercator circle is 36 m too wide at 20 km.
        new TerraDrawCircleMode({ projection: "globe" }),
        new TerraDrawSelectMode({
          flags: SELECT_FLAGS,
          // Delete/rotate/scale change the shape locally without a finish event, so nothing is saved.
          keyEvents: { deselect: "Escape", delete: null, rotate: null, scale: null },
        }),
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
      // A basemap change remounts MapView, which removes this map before `map` state moves on;
      // unregistering layers from a removed map throws.
      if (!map._removed) draw.stop();
      drawRef.current = null;
      // The next TerraDraw starts empty in static mode; a stale "select" would hide the edited
      // feature from the mission layer and keep map clicks ignored.
      setModeState("static");
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
