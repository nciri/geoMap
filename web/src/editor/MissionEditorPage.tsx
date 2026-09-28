import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import {
  createFeature,
  getMission,
  listFeatures,
  updateFeature,
  updateMission,
  type Feature,
} from "../api/geomap";
import { errorMessage } from "../api/client";
import { STATUS_LABELS } from "../format";
import { MissionForm } from "../missions/MissionForm";
import { MapView } from "../map/MapView";
import {
  addMissionLayers,
  boundsOf,
  CLICKABLE_LAYERS,
  MISSION_SOURCE,
  toFeatureCollection,
} from "../map/missionLayer";
import { addSymbolLayers, SYMBOL_CLICKABLE_LAYERS } from "../map/symbolLayer";
import { useSymbolRendering } from "../map/useSymbolRendering";
import { useDrawing } from "../map/useDrawing";
import { drawnToInput, modeFor } from "../map/drawing";
import { SymbolPicker, type PlacedSymbol } from "../symbols/SymbolPicker";
import { DrawToolbar } from "./DrawToolbar";
import { FeaturePanel } from "./FeaturePanel";

export function MissionEditorPage() {
  const { missionId = "" } = useParams();
  const queryClient = useQueryClient();
  const mission = useQuery({
    queryKey: ["mission", missionId],
    queryFn: () => getMission(missionId),
  });
  const features = useQuery({
    queryKey: ["features", missionId],
    queryFn: () => listFeatures(missionId),
  });
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedId);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [placing, setPlacing] = useState<PlacedSymbol | null>(null);
  const placingRef = useRef(placing);
  const refreshFeatures = () =>
    queryClient.invalidateQueries({ queryKey: ["features", missionId] });

  const drawing = useDrawing(map, {
    onCreate: (drawn) => {
      const placed = placingRef.current ?? undefined;
      const converted = drawnToInput(drawn, undefined, placed);
      if ("error" in converted) return setDrawError(converted.error);
      setDrawError(null);
      createFeature(missionId, converted.input).then(
        () => {
          if (placed) {
            setPlacing(null);
            drawing.stopEditing();
          }
          return refreshFeatures();
        },
        (e: unknown) => setDrawError(errorMessage(e)),
      );
    },
    onChange: (featureId, drawn) => {
      const base = features.data?.find((f) => f.id === featureId);
      if (!base) {
        select(null);
        return setDrawError("Cet objet n'existe plus : il a été supprimé entre-temps.");
      }
      // Put the saved shape back so the map shows what the server holds, unless the user has
      // moved on to another object meanwhile.
      const restore = () => {
        if (selectedIdRef.current === featureId) drawing.edit(base);
      };
      const converted = drawnToInput(drawn, base);
      if ("error" in converted) {
        setDrawError(converted.error);
        return restore();
      }
      setDrawError(null);
      updateFeature(missionId, featureId, converted.input).then(refreshFeatures, (e: unknown) => {
        setDrawError(errorMessage(e));
        restore();
      });
    },
  });

  function select(feature: Feature | null) {
    setSelectedId(feature?.id ?? null);
    setDrawError(null);
    // Deselecting must release the previously reshaped object.
    if (feature) setDrawError(drawing.edit(feature));
    else drawing.stopEditing();
  }

  useEffect(() => {
    selectedIdRef.current = selectedId;
    placingRef.current = placing;
  });

  useEffect(() => {
    if (!map) return;
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const properties = e.features?.[0]?.properties;
      const id = (properties?.id ?? properties?.featureId) as string | undefined;
      const clicked = id ? features.data?.find((f) => f.id === id) : undefined;
      // Drawing modes own the clicks; in select mode a click switches to another object.
      if (clicked && (drawing.mode === "static" || drawing.mode === "select")) select(clicked);
    };
    const layers = [...CLICKABLE_LAYERS, ...SYMBOL_CLICKABLE_LAYERS];
    map.on("click", layers, onClick);
    return () => void map.off("click", layers, onClick);
  });

  const editingId = drawing.mode === "select" ? selectedId : null;
  const symbols = useSymbolRendering(map, features.data, editingId);
  useEffect(() => {
    // The previous map lingers here, already removed, until the remounted MapView loads.
    if (!map || map._removed || !features.data) return;
    map
      .getSource<GeoJSONSource>(MISSION_SOURCE)
      ?.setData(toFeatureCollection(features.data, editingId));
  }, [map, features.data, editingId]);

  if (mission.error || features.error) {
    return <p role="alert">{errorMessage(mission.error ?? features.error)}</p>;
  }
  if (!mission.data || !features.data) return <p>Chargement…</p>;
  const current = mission.data;

  return (
    <div className="editor">
      <aside className="panel">
        <h1>{current.name}</h1>
        <p>{STATUS_LABELS[current.status]}</p>
        {!current.basemapId && (
          <p role="status">Aucun fond de carte : choisissez-en un dans les paramètres.</p>
        )}
        <details>
          <summary>Paramètres</summary>
          <MissionForm
            initial={current}
            submitLabel="Enregistrer"
            onSubmit={async (input) => {
              await updateMission(missionId, input);
              await queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
            }}
          />
        </details>
        <DrawToolbar
          mode={drawing.mode}
          onMode={(next) => {
            setSelectedId(null);
            setPlacing(null);
            drawing.setMode(next);
          }}
        />
        <details>
          <summary>Symbole APP-6D</summary>
          <SymbolPicker
            onPlace={(placed) => {
              setSelectedId(null);
              setPlacing(placed);
              drawing.setMode(modeFor(placed.symbol.geometry));
            }}
          />
          {placing && (
            <p role="status">
              Tracez « {placing.symbol.name.trim()} » sur la carte ({placing.symbol.minPoints} à{" "}
              {placing.symbol.maxPoints} points).
            </p>
          )}
        </details>
        {drawError && <p role="alert">{drawError}</p>}
        {symbols.error && <p role="alert">{symbols.error}</p>}
        <FeaturePanel
          missionId={missionId}
          features={features.data}
          selectedId={selectedId}
          onSelect={select}
        />
      </aside>
      <MapView
        key={current.basemapId ?? "none"}
        basemapId={current.basemapId}
        initialBounds={boundsOf(features.data)}
        onReady={(ready) => {
          addMissionLayers(ready);
          addSymbolLayers(ready);
          setMap(ready);
        }}
      />
    </div>
  );
}
