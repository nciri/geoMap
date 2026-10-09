import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { listBasemaps, type Mission, type MissionInput } from "../api/geomap";
import { errorMessage } from "../api/client";
import { attributionText, fromUtcInput, toUtcInput } from "../format";
import { Alert, Button, Icon, IconButton } from "../ui/components";

interface Props {
  initial?: Mission;
  submitLabel: string;
  onSubmit: (input: MissionInput) => Promise<unknown>;
  onCancel?: () => void;
}

export function MissionForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const basemaps = useQuery({ queryKey: ["basemaps"], queryFn: listBasemaps });
  const [name, setName] = useState(initial?.name ?? "");
  const [layers, setLayers] = useState<string[]>(initial?.layers ?? []);
  const [validUntil, setValidUntil] = useState(toUtcInput(initial?.validUntil ?? null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

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
      <section className="form-section">
        <h3 className="form-section__title">Identification</h3>
        <div className="form-grid">
          <div className="form-field">
            <label className="form-label" htmlFor={`${id}-name`}>
              Nom
              <span className="required-star" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              placeholder="Op Nord"
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor={`${id}-until`}>
              Valide jusqu'au (UTC)
            </label>
            <input
              id={`${id}-until`}
              type="datetime-local"
              value={validUntil}
              aria-describedby={`${id}-until-hint`}
              onChange={(e) => setValidUntil(e.target.value)}
            />
            <small className="form-hint" id={`${id}-until-hint`}>
              Les terminaux effacent la mission passé ce délai.
            </small>
          </div>
        </div>
      </section>
      <section className="form-section">
        <h3 className="form-section__title">Couches</h3>
        <div className="form-grid">
          <div className="form-field">
            <label className="form-label" htmlFor={`${id}-base`}>
              Fond de carte
            </label>
            <select
              id={`${id}-base`}
              value={vector}
              aria-describedby={`${id}-base-hint`}
              onChange={(e) => setVector(e.target.value)}
            >
              <option value="">— aucun —</option>
              {vectors.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <small className="form-hint" id={`${id}-base-hint`}>
              Nécessaire pour publier.
            </small>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor={`${id}-imagery`}>
              Ajouter une imagerie
            </label>
            <select
              id={`${id}-imagery`}
              value=""
              aria-describedby={`${id}-imagery-hint`}
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
            <small className="form-hint" id={`${id}-imagery-hint`}>
              Empilée au-dessus du fond, dans l'ordre de la liste.
            </small>
          </div>
        </div>
        {imagery.length === 0 ? (
          <p className="form-empty">
            <Icon name="layers" size={16} />
            Aucune imagerie : les vues Satellite et Hybride restent indisponibles.
          </p>
        ) : (
          <ul className="layer-list">
            {imagery.map((id, index) => (
              <li key={id} className="layer-row">
                <Icon name="layers" size={16} />
                <span className="layer-row__text">
                  <span className="layer-row__name">{nameOf(id)}</span>
                  <small className="layer-row__meta">{attributionOf(id)}</small>
                </span>
                <IconButton
                  icon="chevron-up"
                  label={`Monter ${nameOf(id)}`}
                  tooltip="Monter"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                />
                <IconButton
                  icon="chevron-down"
                  label={`Descendre ${nameOf(id)}`}
                  tooltip="Descendre"
                  disabled={index === imagery.length - 1}
                  onClick={() => move(index, 1)}
                />
                <IconButton
                  icon="close"
                  label={`Retirer ${nameOf(id)}`}
                  tooltip="Retirer"
                  onClick={() => remove(index)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      {basemaps.error && <Alert severity="error" title={errorMessage(basemaps.error)} />}
      {error && <Alert severity="error" title={error} />}
      <div className="form-actions">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        )}
        {/* Creating is the missions page's one action; in the editor, publishing is. */}
        <Button
          type="submit"
          variant={initial ? "secondary" : "primary"}
          icon={initial ? "check" : "plus"}
          disabled={busy}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
