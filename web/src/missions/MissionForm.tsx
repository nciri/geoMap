import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { listBasemaps, type Mission, type MissionInput } from "../api/geomap";
import { errorMessage } from "../api/client";
import { fromUtcInput, toUtcInput } from "../format";

interface Props {
  initial?: Mission;
  submitLabel: string;
  onSubmit: (input: MissionInput) => Promise<unknown>;
}

export function MissionForm({ initial, submitLabel, onSubmit }: Props) {
  const basemaps = useQuery({ queryKey: ["basemaps"], queryFn: listBasemaps });
  const [name, setName] = useState(initial?.name ?? "");
  const [basemapId, setBasemapId] = useState(initial?.basemapId ?? "");
  const [validUntil, setValidUntil] = useState(toUtcInput(initial?.validUntil ?? null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        basemapId: basemapId || null,
        validUntil: fromUtcInput(validUntil),
      });
      if (!initial) {
        setName("");
        setValidUntil("");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mission-form">
      <label>
        Nom
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
      </label>
      <label>
        Fond de carte
        <select value={basemapId} onChange={(e) => setBasemapId(e.target.value)}>
          <option value="">— aucun —</option>
          {basemaps.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Valide jusqu'au (UTC)
        <input
          type="datetime-local"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />
      </label>
      <button type="submit" disabled={busy}>
        {submitLabel}
      </button>
      {basemaps.error && <p role="alert">{errorMessage(basemaps.error)}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
