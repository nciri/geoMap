import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  downloadPackage,
  getValidation,
  listVersions,
  publishMission,
  withdrawMission,
  type Mission,
  type ValidationIssue,
} from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc } from "../format";
import { saveFile } from "../files";

export const VALIDATION_LABELS: Record<string, string> = {
  NO_BASEMAP: "Aucun fond de carte",
  UNKNOWN_BASEMAP: "Fond de carte inconnu",
  NO_EXPIRY: "Aucune date de validité",
  EXPIRED: "Date de validité dépassée",
  NO_RECIPIENT: "Aucun terminal enrôlé affecté",
  SYMBOL_NOT_RENDERABLE: "Symbole impossible à afficher",
  PENDING_SUGGESTIONS: "Suggestions IA en attente",
  EMPTY_MISSION: "Mission vide",
};

interface Props {
  mission: Mission;
  revision: string;
  onSelectFeature: (featureId: string) => void;
}

const terminals = (n: number) => `${n} ${n > 1 ? "terminaux" : "terminal"}`;

export function PublicationPanel({ mission, revision, onSelectFeature }: Props) {
  const queryClient = useQueryClient();
  const validation = useQuery({
    queryKey: ["validation", mission.id, revision],
    queryFn: () => getValidation(mission.id),
    // Every save bumps the revision; without this the report and publish button blink out.
    placeholderData: keepPreviousData,
  });
  const versions = useQuery({
    queryKey: ["versions", mission.id],
    queryFn: () => listVersions(mission.id),
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const withdrawn = mission.status === "WITHDRAWN";
  const published = (versions.data?.length ?? 0) > 0;
  const nextVersion = Math.max(0, ...(versions.data ?? []).map((v) => v.version)) + 1;
  const blocked = !validation.data || validation.data.errors.length > 0;

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      // A refusal means the server's view changed too: refresh it so the French reason shows.
      await Promise.all(
        [
          ["mission", mission.id],
          ["missions"],
          ["versions", mission.id],
          ["validation", mission.id],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      setBusy(false);
    }
  }

  const issue = (i: ValidationIssue, index: number) => {
    const label = VALIDATION_LABELS[i.code] ?? i.message;
    return (
      <li key={`${i.code}-${index}`} title={i.message}>
        {i.featureId ? (
          <button className="link" onClick={() => onSelectFeature(i.featureId!)}>
            {label}
          </button>
        ) : (
          label
        )}
      </li>
    );
  };

  return (
    <section className="publication">
      <h2>Publication</h2>
      {validation.error && <p role="alert">{errorMessage(validation.error)}</p>}
      {validation.data &&
        (validation.data.errors.length === 0 ? (
          <p>Aucune erreur bloquante.</p>
        ) : (
          <ul aria-label="Erreurs bloquantes" className="errors">
            {validation.data.errors.map(issue)}
          </ul>
        ))}
      {validation.data && validation.data.warnings.length > 0 && (
        <ul aria-label="Avertissements" className="warnings">
          {validation.data.warnings.map(issue)}
        </ul>
      )}
      {withdrawn ? (
        <p>Mission retirée : les terminaux la suppriment au prochain contact.</p>
      ) : (
        <div className="actions">
          <button
            disabled={busy || blocked}
            onClick={() =>
              void run(async () => {
                const v = await publishMission(mission.id);
                return `Version ${v.version} publiée pour ${terminals(v.recipients)}.`;
              })
            }
          >
            Publier la version {nextVersion}
          </button>
          {published && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const file = await downloadPackage(mission.id);
                  saveFile(file.blob, file.filename);
                  return null;
                })
              }
            >
              Exporter pour carte SD
            </button>
          )}
          {published &&
            (confirmWithdraw ? (
              <>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await withdrawMission(mission.id);
                      setConfirmWithdraw(false);
                      return "Mission retirée.";
                    })
                  }
                >
                  Confirmer le retrait
                </button>
                <button onClick={() => setConfirmWithdraw(false)}>Annuler</button>
              </>
            ) : (
              <button onClick={() => setConfirmWithdraw(true)}>Retirer la mission</button>
            ))}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {versions.error && <p role="alert">{errorMessage(versions.error)}</p>}
      {published && (
        <ul aria-label="Versions publiées">
          {[...versions.data!]
            .sort((a, b) => b.version - a.version)
            .map((v) => (
              <li key={v.version}>
                v{v.version} — {formatUtc(v.publishedAt)} par {v.publishedBy} —{" "}
                {terminals(v.recipients)} — {Math.ceil(v.sizeBytes / 1024)} Ko
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
