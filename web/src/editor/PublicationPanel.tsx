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
import { Alert, Button, StatusBadge } from "../ui/components";
import { saveFile } from "../files";

export const VALIDATION_LABELS: Record<string, string> = {
  NO_BASEMAP: "Aucun fond de carte",
  UNKNOWN_BASEMAP: "Fond de carte inconnu",
  IMAGERY_OUT_OF_AREA: "Imagerie hors de la zone des objets",
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

  const issue = (blocking: boolean) => (i: ValidationIssue, index: number) => {
    const label = VALIDATION_LABELS[i.code] ?? i.message;
    return (
      <li key={`${i.code}-${index}`} title={i.message}>
        {blocking ? (
          <StatusBadge state="error">Bloquant</StatusBadge>
        ) : (
          <StatusBadge state="degraded">Avertissement</StatusBadge>
        )}{" "}
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
      {validation.error && <Alert severity="error" title={errorMessage(validation.error)} />}
      {validation.data &&
        (validation.data.errors.length === 0 ? (
          <p>Aucune erreur bloquante.</p>
        ) : (
          <ul aria-label="Erreurs bloquantes" className="errors">
            {validation.data.errors.map(issue(true))}
          </ul>
        ))}
      {validation.data && validation.data.warnings.length > 0 && (
        <ul aria-label="Avertissements" className="warnings">
          {validation.data.warnings.map(issue(false))}
        </ul>
      )}
      {withdrawn ? (
        <p>Mission retirée : les terminaux la suppriment au prochain contact.</p>
      ) : (
        <div className="actions">
          <Button
            variant="primary"
            icon="publish"
            disabled={busy || blocked}
            onClick={() =>
              void run(async () => {
                const v = await publishMission(mission.id);
                return `Version ${v.version} publiée pour ${terminals(v.recipients)}.`;
              })
            }
          >
            Publier la version {nextVersion}
          </Button>
          {published && (
            <Button
              icon="download"
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
            </Button>
          )}
          {published &&
            (confirmWithdraw ? (
              <>
                <Button
                  variant="irreversible"
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
                </Button>
                <Button variant="ghost" onClick={() => setConfirmWithdraw(false)}>
                  Annuler
                </Button>
              </>
            ) : (
              <Button onClick={() => setConfirmWithdraw(true)}>Retirer la mission</Button>
            ))}
        </div>
      )}
      {notice && <Alert title={notice} />}
      {error && <Alert severity="error" title={error} />}
      {versions.error && <Alert severity="error" title={errorMessage(versions.error)} />}
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
