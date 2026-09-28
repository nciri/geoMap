import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  acceptFeature,
  deleteFeature,
  rejectFeature,
  updateFeature,
  type Feature,
} from "../api/geomap";
import { errorMessage } from "../api/client";
import { DEFAULT_COLOR, isCircle } from "../map/missionLayer";

interface Props {
  missionId: string;
  features: Feature[];
  selectedId: string | null;
  onSelect: (feature: Feature | null) => void;
}

function typeLabel(f: Feature): string {
  if (f.kind === "APP6") return `APP-6D ${f.sidc ?? ""}`;
  if (isCircle(f)) return "Cercle";
  if (f.geometry.type === "Point") return "Point";
  return f.geometry.type === "LineString" ? "Ligne" : "Zone";
}

const isPending = (f: Feature) => f.suggestionStatus === "PENDING";

export function FeaturePanel({ missionId, features, selectedId, onSelect }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const visible = features.filter((f) => f.suggestionStatus !== "REJECTED");
  const selected = visible.find((f) => f.id === selectedId) ?? null;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["features", missionId] });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="features">
      <h2>Objets ({visible.length})</h2>
      {error && <p role="alert">{error}</p>}
      <ul>
        {visible.map((f) => {
          const name = f.name || "Sans nom";
          return (
            <li key={f.id} className={f.id === selectedId ? "selected" : undefined}>
              <button className="feature-item" onClick={() => onSelect(f)}>
                <span>{name}</span> <small>{typeLabel(f)}</small>
                {isPending(f) && <span className="badge"> Suggestion IA</span>}
              </button>
              {isPending(f) && (
                <span className="decision">
                  <button
                    aria-label={`Accepter ${name}`}
                    onClick={() => void run(() => acceptFeature(missionId, f.id))}
                  >
                    Accepter
                  </button>
                  <button
                    aria-label={`Rejeter ${name}`}
                    onClick={() => void run(() => rejectFeature(missionId, f.id))}
                  >
                    Rejeter
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {selected && (
        <FeatureDetails
          key={selected.id}
          feature={selected}
          onSave={(changes) =>
            run(() =>
              updateFeature(missionId, selected.id, {
                kind: selected.kind,
                geometry: selected.geometry,
                name: changes.name,
                description: changes.description,
                style:
                  selected.kind === "GENERIC"
                    ? {
                        ...selected.style,
                        color: changes.color,
                        ...(changes.radiusMeters ? { radiusMeters: changes.radiusMeters } : {}),
                      }
                    : selected.style,
                sidc: selected.sidc,
                modifiers: selected.modifiers,
              }),
            )
          }
          onDelete={() =>
            run(async () => {
              await deleteFeature(missionId, selected.id);
              onSelect(null);
            })
          }
        />
      )}
    </section>
  );
}

interface Changes {
  name: string;
  description: string;
  color: string;
  radiusMeters?: number;
}

function FeatureDetails({
  feature,
  onSave,
  onDelete,
}: {
  feature: Feature;
  onSave: (changes: Changes) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(feature.name);
  const [description, setDescription] = useState(feature.description);
  const [color, setColor] = useState(feature.style?.color ?? DEFAULT_COLOR);
  const circle = isCircle(feature);
  // Drawn radii carry decimetres, which step=1 would reject and so block every save of the form.
  const [radius, setRadius] = useState(
    circle ? String(Math.round(feature.style.radiusMeters)) : "",
  );
  const [confirming, setConfirming] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSave({
      name: name.trim(),
      description,
      color,
      ...(circle ? { radiusMeters: Number(radius) } : {}),
    });
  }

  return (
    <form className="feature-details" onSubmit={submit}>
      <label>
        Nom de l'objet
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </label>
      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
        />
      </label>
      {feature.kind === "GENERIC" && (
        <label>
          Couleur
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      )}
      {circle && (
        <label>
          Rayon (m)
          <input
            type="number"
            required
            min={1}
            step={1}
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </label>
      )}
      <button type="submit">Enregistrer l'objet</button>
      {confirming ? (
        <>
          <button type="button" onClick={() => void onDelete()}>
            Confirmer la suppression
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            Annuler
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          Supprimer l'objet
        </button>
      )}
    </form>
  );
}
