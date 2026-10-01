import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { listBasemaps, type Mission, type MissionInput } from "../api/geomap";
import { errorMessage } from "../api/client";
import { attributionText, fromUtcInput, toUtcInput } from "../format";
import { Alert, Button } from "../ui/components";

interface Props {
  initial?: Mission;
  submitLabel: string;
  onSubmit: (input: MissionInput) => Promise<unknown>;
}

export function MissionForm({ initial, submitLabel, onSubmit }: Props) {
  const basemaps = useQuery({ queryKey: ["basemaps"], queryFn: listBasemaps });
  const [name, setName] = useState(initial?.name ?? "");
  const [layers, setLayers] = useState<string[]>(initial?.layers ?? []);
  const [validUntil, setValidUntil] = useState(toUtcInput(initial?.validUntil ?? null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const vectors = basemaps.data?.filter((b) => b.kind === "VECTOR") ?? [];
  const rasters = basemaps.data?.filter((b) => b.kind === "RASTER") ?? [];
  // Split by kind, not position: an imagery-only mission has no vector layer first.
  const vector = layers.find((id) => vectors.some((b) => b.id === id)) ?? "";
  const imagery = layers.filter((id) => id !== vector);
  const setVector = (id: string) => setLayers([...(id ? [id] : []), ...imagery]);
  const setImagery = (update: (current: string[]) => string[]) =>
    setLayers([...(vector ? [vector] : []), ...update(imagery)]);
  const nameOf = (id: string) => basemaps.data?.find((b) => b.id === id)?.name ?? id;
  const attributionOf = (id: string) =>
    attributionText(basemaps.data?.find((b) => b.id === id)?.attribution ?? "");

  function move(index: number, delta: number) {
    setImagery((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(index + delta, 0, moved);
      return next;
    });
  }

  function remove(index: number) {
    setImagery((current) => current.filter((_, i) => i !== index));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        layers: [...(vector ? [vector] : []), ...imagery],
        validUntil: fromUtcInput(validUntil),
      });
      if (!initial) {
        setName("");
        setLayers([]);
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
        <select value={vector} onChange={(e) => setVector(e.target.value)}>
          <option value="">— aucun —</option>
          {vectors.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="imagery">
        <legend>Couches</legend>
        <ul>
          {imagery.map((id, index) => (
            <li key={id}>
              {nameOf(id)} — {attributionOf(id)}
              <Button variant="ghost" disabled={index === 0} onClick={() => move(index, -1)}>
                Monter {nameOf(id)}
              </Button>
              <Button
                variant="ghost"
                disabled={index === imagery.length - 1}
                onClick={() => move(index, 1)}
              >
                Descendre {nameOf(id)}
              </Button>
              <Button variant="ghost" onClick={() => remove(index)}>
                Retirer {nameOf(id)}
              </Button>
            </li>
          ))}
        </ul>
        <label>
          Ajouter une imagerie
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) setImagery((current) => [...current, id]);
            }}
          >
            <option value="">— choisir —</option>
            {rasters
              .filter((b) => !imagery.includes(b.id))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
      </fieldset>
      <label>
        Valide jusqu'au (UTC)
        <input
          type="datetime-local"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />
      </label>
      {/* Creating is the missions page's one action; in the editor, publishing is. */}
      <Button type="submit" variant={initial ? "secondary" : "primary"} disabled={busy}>
        {submitLabel}
      </Button>
      {basemaps.error && <Alert severity="error" title={errorMessage(basemaps.error)} />}
      {error && <Alert severity="error" title={error} />}
    </form>
  );
}
