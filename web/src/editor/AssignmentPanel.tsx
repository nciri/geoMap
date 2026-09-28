import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { assignDevices, listAssignedDevices, listDevices } from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc } from "../format";

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
  const selection = chosen ?? new Set(assigned.data?.map((d) => d.id) ?? []);

  function toggle(id: string) {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  }

  async function save() {
    setError(null);
    setNotice(null);
    try {
      await assignDevices(missionId, [...selection].sort());
      setChosen(null);
      setNotice("Affectation enregistrée.");
      await Promise.all(
        [
          ["assigned", missionId],
          ["versions", missionId],
          ["validation", missionId],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const loadError = devices.error ?? assigned.error;
  return (
    <section className="assignment">
      <h2>Terminaux affectés</h2>
      {loadError && <p role="alert">{errorMessage(loadError)}</p>}
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
              </label>{" "}
              <small>dernier contact : {d.lastContact ? formatUtc(d.lastContact) : "jamais"}</small>
            </li>
          );
        })}
      </ul>
      <button disabled={disabled || !devices.data || !assigned.data} onClick={() => void save()}>
        Enregistrer l'affectation
      </button>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
