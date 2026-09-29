import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createMission, deleteMission, listMissions } from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc, STATUS_LABELS } from "../format";
import { MissionForm } from "./MissionForm";

export function MissionsPage() {
  const queryClient = useQueryClient();
  const missions = useQuery({ queryKey: ["missions"], queryFn: listMissions });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["missions"] });

  async function remove(id: string) {
    setError(null);
    try {
      await deleteMission(id);
      setConfirming(null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <main className="page">
      <h1>Missions</h1>
      <MissionForm
        submitLabel="Créer la mission"
        onSubmit={async (input) => {
          await createMission(input);
          await refresh();
        }}
      />
      {missions.isPending && <p>Chargement…</p>}
      {missions.error && <p role="alert">{errorMessage(missions.error)}</p>}
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Statut</th>
            <th>Valide jusqu'au</th>
            <th>Modifiée</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {missions.data?.map((m) => (
            <tr key={m.id}>
              <td>
                <Link to={`/missions/${m.id}`}>{m.name}</Link>
              </td>
              <td>{STATUS_LABELS[m.status]}</td>
              <td>{formatUtc(m.validUntil)}</td>
              <td>
                {formatUtc(m.updatedAt)} par {m.updatedBy}
              </td>
              <td>
                {m.status === "DRAFT" &&
                  (confirming === m.id ? (
                    <>
                      <button onClick={() => void remove(m.id)}>Confirmer la suppression</button>
                      <button onClick={() => setConfirming(null)}>Annuler</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirming(m.id)}>Supprimer</button>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
