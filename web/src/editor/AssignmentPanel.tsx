import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { assignDevices, listAssignedDevices, listDevices } from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc } from "../format";
import { Alert, Button } from "../ui/components";

export function AssignmentPanel({ missionId, disabled }: { missionId: string; disabled: boolean }) {
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ["devices"], queryFn: listDevices });
  const assigned = useQuery({
    queryKey: ["assigned", missionId],
    queryFn: () => listAssignedDevices(missionId),
  });
  // null until the user ticks a box: the server's list is the starting point.
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const enrolledIds = new Set(
    devices.data?.filter((d) => d.status === "ENROLLED").map((d) => d.id) ?? [],
  );
  const assignedIds = new Set(assigned.data?.map((d) => d.id) ?? []);
  // The server rejects any revoked id, so a device revoked after being assigned must never be
  // resent — it starts out of the selection even though it is still in `assigned.data`.
  const selection = chosen ?? new Set([...assignedIds].filter((id) => enrolledIds.has(id)));

  function toggle(id: string) {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const deviceIds = [...selection].filter((id) => enrolledIds.has(id)).sort();
      await assignDevices(missionId, deviceIds);
      setChosen(null);
      setNotice("Affectation enregistrée.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      await Promise.all(
        [
          ["assigned", missionId],
          ["versions", missionId],
          ["validation", missionId],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      setBusy(false);
    }
  }

  const loadError = devices.error ?? assigned.error;
  return (
    <section className="assignment">
      <h2>Terminaux affectés</h2>
      {loadError && <Alert severity="error" title={errorMessage(loadError)} />}
      {devices.data?.length === 0 && (
        <p>Aucun terminal enregistré : demandez à un administrateur.</p>
      )}
      <ul>
        {devices.data?.map((d) => {
          const revoked = d.status === "REVOKED";
          return (
            <li key={d.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selection.has(d.id)}
                  disabled={disabled || revoked}
                  onChange={() => toggle(d.id)}
                />
                {d.name}
                {revoked && " — révoqué"}
                {revoked && assignedIds.has(d.id) && " (retiré à l'enregistrement)"}
              </label>{" "}
              <small>dernier contact : {d.lastContact ? formatUtc(d.lastContact) : "jamais"}</small>
            </li>
          );
        })}
      </ul>
      <Button
        disabled={busy || disabled || !devices.data || !assigned.data}
        onClick={() => void save()}
      >
        Enregistrer l'affectation
      </Button>
      {notice && <Alert title={notice} />}
      {error && <Alert severity="error" title={error} />}
    </section>
  );
}
