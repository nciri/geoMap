import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import {
  createFeature,
  getMission,
  listBasemaps,
  listFeatures,
  updateFeature,
  updateMission,
  type Feature,
} from "../api/geomap";
import { errorMessage } from "../api/client";
import { missionState, STATUS_LABELS } from "../format";
import { Alert, StatusBadge } from "../ui/components";
import { MissionForm } from "../missions/MissionForm";
import { MapView } from "../map/MapView";
import { ModeSwitch } from "../map/ModeSwitch";
import { effectiveMode, loadMode, saveMode } from "../map/mapModes";
import type { StackLayer } from "../map/style";
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
import { AssignmentPanel } from "./AssignmentPanel";
import { PublicationPanel } from "./PublicationPanel";

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
  const basemaps = useQuery({ queryKey: ["basemaps"], queryFn: listBasemaps });
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedId);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [placing, setPlacing] = useState<PlacedSymbol | null>(null);
  const placingRef = useRef(placing);
  const [mode, setMode] = useState(loadMode);
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

  if (mission.error || features.error || basemaps.error) {
    return (
      <Alert
        severity="error"
        title={errorMessage(mission.error ?? features.error ?? basemaps.error)}
      />
    );
  }
  if (!mission.data || !features.data || !basemaps.data) return <Alert title="Chargement…" />;
  const current = mission.data;
  const basemapOf = (layerId: string) => basemaps.data.find((b) => b.id === layerId);
  const toLayer = ({ id, name, attribution }: StackLayer): StackLayer => ({
    id,
    name,
    attribution,
  });
  const first = basemapOf(current.layers[0] ?? "");
  const vector = first?.kind === "VECTOR" ? toLayer(first) : null;
  const imagery = current.layers.flatMap((layerId) => {
    const layer = basemapOf(layerId);
    return layer?.kind === "RASTER" ? [toLayer(layer)] : [];
  });
  const shown = effectiveMode(mode, imagery.length > 0);

  return (
    <div className="editor">
      <aside className="panel">
        <h1>{current.name}</h1>
        <p>
          <StatusBadge state={missionState(current.status)}>
            {STATUS_LABELS[current.status]}
          </StatusBadge>
        </p>
        {!vector && (
          <Alert
            severity="degraded"
            title="Aucun fond de carte : choisissez-en un dans les paramètres."
          />
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
          // Terra Draw exists only once the map has loaded; earlier clicks would be dropped.
          disabled={!map}
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
        {drawError && <Alert severity="error" title={drawError} />}
        {symbols.error && <Alert severity="error" title={symbols.error} />}
        <FeaturePanel
          missionId={missionId}
          features={features.data}
          selectedId={selectedId}
          onSelect={select}
        />
        <AssignmentPanel missionId={missionId} disabled={current.status === "WITHDRAWN"} />
        <PublicationPanel
          mission={current}
          revision={`${mission.dataUpdatedAt}-${features.dataUpdatedAt}`}
          onSelectFeature={(featureId) => {
            const target = features.data?.find((f) => f.id === featureId);
            if (target) select(target);
          }}
        />
      </aside>
      <MapView
        key={current.layers.join("|") || "none"}
        vector={vector}
        imagery={imagery}
        mode={shown}
        initialBounds={boundsOf(features.data)}
        onReady={(ready) => {
          addMissionLayers(ready);
          addSymbolLayers(ready);
          setMap(ready);
        }}
      >
        <ModeSwitch
          mode={shown}
          hasImagery={imagery.length > 0}
          onMode={(next) => {
            saveMode(next);
            setMode(next);
          }}
        />
      </MapView>
    </div>
  );
}
