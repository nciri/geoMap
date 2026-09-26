import { useSession } from "./auth/AuthProvider";

export function App() {
  const { name, signOut } = useSession();
  return (
    <header>
      <strong>geoMap</strong> {name} <button onClick={signOut}>Déconnexion</button>
    </header>
  );
}
