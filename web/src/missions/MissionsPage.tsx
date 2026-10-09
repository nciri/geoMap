import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createMission, deleteMission, listMissions } from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc, missionState, STATUS_LABELS } from "../format";
import { Alert, Button, IconButton, StatusBadge } from "../ui/components";
import { Dialog } from "../ui/Dialog";
import { MissionForm } from "./MissionForm";

export function MissionsPage() {
  const queryClient = useQueryClient();
  const missions = useQuery({ queryKey: ["missions"], queryFn: listMissions });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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
      <div className="page-toolbar">
        <p className="muted">
          {missions.data
            ? `${missions.data.length} mission${missions.data.length > 1 ? "s" : ""}`
            : ""}
        </p>
        <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
          Nouvelle mission
        </Button>
      </div>
      {creating && (
        <Dialog title="Nouvelle mission" onClose={() => setCreating(false)}>
          <MissionForm
            submitLabel="Créer la mission"
            onCancel={() => setCreating(false)}
            onSubmit={async (input) => {
              await createMission(input);
              setCreating(false);
              await refresh();
            }}
          />
        </Dialog>
      )}
      {missions.isPending && <Alert title="Chargement…" />}
      {missions.error && <Alert severity="error" title={errorMessage(missions.error)} />}
      {error && <Alert severity="error" title={error} />}
      <table className="al-table">
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
              <td>
                <StatusBadge state={missionState(m.status)}>{STATUS_LABELS[m.status]}</StatusBadge>
              </td>
              <td>{formatUtc(m.validUntil)}</td>
              <td>
                {formatUtc(m.updatedAt)} par {m.updatedBy}
              </td>
              <td>
                {m.status === "DRAFT" &&
                  (confirming === m.id ? (
                    <>
                      <Button variant="irreversible" onClick={() => void remove(m.id)}>
                        Confirmer la suppression
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirming(null)}>
                        Annuler
                      </Button>
                    </>
                  ) : (
                    <IconButton
                      icon="trash"
                      label={`Supprimer ${m.name}`}
                      tooltip="Supprimer"
                      onClick={() => setConfirming(m.id)}
                    />
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
