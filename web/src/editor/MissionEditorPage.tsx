import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { getMission, listFeatures, updateMission } from "../api/geomap";
import { errorMessage } from "../api/client";
import { STATUS_LABELS } from "../format";
import { MissionForm } from "../missions/MissionForm";
import { MapView } from "../map/MapView";
import {
  addMissionLayers,
  boundsOf,
  MISSION_SOURCE,
  toFeatureCollection,
} from "../map/missionLayer";

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

  useEffect(() => {
    if (!map || !features.data) return;
    map.getSource<GeoJSONSource>(MISSION_SOURCE)?.setData(toFeatureCollection(features.data));
  }, [map, features.data]);

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
