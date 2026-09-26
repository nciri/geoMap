import { useEffect, useState } from "react";
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
import { useDrawing } from "../map/useDrawing";
import { toFeatureInput } from "../map/drawing";
import { DrawToolbar } from "./DrawToolbar";

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
  const [drawError, setDrawError] = useState<string | null>(null);
  const refreshFeatures = () =>
    queryClient.invalidateQueries({ queryKey: ["features", missionId] });

  const drawing = useDrawing(map, {
    onCreate: (drawn) => {
      setDrawError(null);
      createFeature(missionId, toFeatureInput(drawn)).then(refreshFeatures, (e: unknown) =>
        setDrawError(errorMessage(e)),
      );
    },
    onChange: (featureId, drawn) => {
      const base = features.data?.find((f) => f.id === featureId);
      if (!base) return;
      setDrawError(null);
      updateFeature(missionId, featureId, toFeatureInput(drawn, base)).then(
        refreshFeatures,
        (e: unknown) => {
          setDrawError(errorMessage(e));
          // Put the saved shape back so the map shows what the server holds.
          drawing.edit(base);
        },
      );
    },
  });

  function select(feature: Feature | null) {
    setSelectedId(feature?.id ?? null);
    setDrawError(null);
    if (!feature) return drawing.stopEditing();
    if (feature.kind === "GENERIC") setDrawError(drawing.edit(feature));
  }

  useEffect(() => {
    if (!map) return;
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      const clicked = id ? features.data?.find((f) => f.id === id) : undefined;
      if (clicked && drawing.mode === "static") select(clicked);
    };
    map.on("click", CLICKABLE_LAYERS, onClick);
    return () => void map.off("click", CLICKABLE_LAYERS, onClick);
  });

  const editingId = drawing.mode === "select" ? selectedId : null;
  useEffect(() => {
    if (!map || !features.data) return;
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
            drawing.setMode(next);
          }}
        />
        {drawError && <p role="alert">{drawError}</p>}
      </aside>
      <MapView
        key={current.basemapId ?? "none"}
        basemapId={current.basemapId}
        initialBounds={boundsOf(features.data)}
        onReady={(ready) => {
          addMissionLayers(ready);
          setMap(ready);
        }}
      />
    </div>
  );
}
