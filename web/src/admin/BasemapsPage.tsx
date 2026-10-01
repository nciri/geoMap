import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listBasemaps, uploadBasemap, type BasemapKind } from "../api/geomap";
import { errorMessage } from "../api/client";
import { attributionText, formatUtc } from "../format";
import { Alert, Button, StatusBadge } from "../ui/components";

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} Mo`;
const KIND_LABELS: Record<BasemapKind, string> = {
  VECTOR: "Vectoriel",
  RASTER: "Imagerie",
};

export function BasemapsPage() {
  const queryClient = useQueryClient();
  const basemaps = useQuery({ queryKey: ["basemaps"], queryFn: listBasemaps });
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!file) {
      setError("Sélectionnez un fichier PMTiles.");
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const saved = await uploadBasemap(id.trim(), name.trim(), file, setProgress);
      setNotice(`Fond de carte « ${saved.name} » importé.`);
      // A file input cannot be controlled: clear its selection directly.
      if (fileInput.current) fileInput.current.value = "";
      setId("");
      setName("");
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["basemaps"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }

  return (
    <main className="page">
      <h2 className="section-title">Importer un fond de carte</h2>
      <p className="muted">
        Import d'un fichier PMTiles déjà généré ; la génération depuis un extrait OSM arrive avec le
        déploiement.
      </p>
      <form onSubmit={submit} className="admin-form">
        <label>
          Identifiant
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
            pattern="[a-z0-9\-]{1,64}"
            title="lettres minuscules, chiffres et tirets"
          />
        </label>
        <label>
          Nom
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
        </label>
        <label>
          Fichier PMTiles
          <input
            type="file"
            ref={fileInput}
            accept=".pmtiles"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button type="submit" variant="primary" icon="install" disabled={progress !== null}>
          Importer
        </Button>
        {progress !== null && <progress value={progress} max={1} aria-label="Import en cours" />}
      </form>
      {notice && <Alert title={notice} />}
      {error && <Alert severity="error" title={error} />}
      {basemaps.error && <Alert severity="error" title={errorMessage(basemaps.error)} />}
      <table className="al-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Identifiant</th>
            <th>Type</th>
            <th>Attribution</th>
            <th>Taille</th>
            <th>Importé</th>
          </tr>
        </thead>
        <tbody>
          {basemaps.data?.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td className="al-mono">{b.id}</td>
              <td>
                <StatusBadge state="blocked">{KIND_LABELS[b.kind]}</StatusBadge>
              </td>
              <td>{attributionText(b.attribution)}</td>
              <td className="al-mono">{megabytes(b.sizeBytes)}</td>
              <td>
                {formatUtc(b.createdAt)} par {b.createdBy}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
