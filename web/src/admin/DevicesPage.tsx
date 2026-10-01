import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listDevices, registerDevice, revokeDevice } from "../api/geomap";
import { errorMessage } from "../api/client";
import { formatUtc } from "../format";
import { Alert, Button, StatusBadge } from "../ui/components";

export function DevicesPage() {
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ["devices"], queryFn: listDevices });
  const [name, setName] = useState("");
  const [certSha256, setCertSha256] = useState("");
  const [pem, setPem] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["devices"] });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await registerDevice({
        name: name.trim(),
        certSha256: certSha256.trim(),
        encryptionPublicKeyPem: pem.trim(),
      });
      setName("");
      setCertSha256("");
      setPem("");
    });
  }

  return (
    <main className="page">
      <h2 className="section-title">Enregistrer un terminal</h2>
      <p className="muted">Enregistrement manuel en attendant l'enrôlement par QR code.</p>
      <form onSubmit={submit} className="admin-form">
        <label>
          Nom
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </label>
        <label>
          Empreinte du certificat (SHA-256)
          <input value={certSha256} onChange={(e) => setCertSha256(e.target.value)} required />
        </label>
        <label>
          Clé publique de chiffrement (PEM)
          <textarea value={pem} onChange={(e) => setPem(e.target.value)} required rows={4} />
        </label>
        <Button type="submit" variant="primary">
          Enregistrer le terminal
        </Button>
      </form>
      {error && <Alert severity="error" title={error} />}
      {devices.error && <Alert severity="error" title={errorMessage(devices.error)} />}
      <table className="al-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Empreinte</th>
            <th>Statut</th>
            <th>Dernier contact</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {devices.data?.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td className="al-mono" title={d.certSha256}>
                {d.certSha256.slice(0, 12)}…
              </td>
              <td>
                {d.status === "ENROLLED" ? (
                  <StatusBadge state="ok">Enrôlé</StatusBadge>
                ) : (
                  <StatusBadge state="revoked">Révoqué</StatusBadge>
                )}
              </td>
              <td>{d.lastContact ? formatUtc(d.lastContact) : "jamais"}</td>
              <td>
                {d.status === "ENROLLED" &&
                  (confirming === d.id ? (
                    <>
                      <Button
                        variant="irreversible"
                        onClick={() =>
                          void run(async () => {
                            await revokeDevice(d.id);
                            setConfirming(null);
                          })
                        }
                      >
                        Confirmer la révocation
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirming(null)}>
                        Annuler
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setConfirming(d.id)}>Révoquer</Button>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
