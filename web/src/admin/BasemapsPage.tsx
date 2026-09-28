import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listBasemaps, uploadBasemap } from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc } from "../format";

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} Mo`;

export function BasemapsPage() {
  const queryClient = useQueryClient();
  const basemaps = useQuery({ queryKey: ["basemaps"], queryFn: listBasemaps });
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError(null);
    setNotice(null);
    setProgress(0);
    try {
      const saved = await uploadBasemap(id.trim(), name.trim(), file, setProgress);
      setNotice(`Fond de carte « ${saved.name} » importé.`);
      await queryClient.invalidateQueries({ queryKey: ["basemaps"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }

  return (
    <main className="page">
      <h1>Fonds de carte</h1>
      <p>
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
            accept=".pmtiles"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" disabled={progress !== null}>
          Importer
        </button>
        {progress !== null && <progress value={progress} max={1} aria-label="Import en cours" />}
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {basemaps.error && <p role="alert">{errorMessage(basemaps.error)}</p>}
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Identifiant</th>
            <th>Taille</th>
            <th>Importé</th>
          </tr>
        </thead>
        <tbody>
          {basemaps.data?.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td>{b.id}</td>
              <td>{megabytes(b.sizeBytes)}</td>
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
