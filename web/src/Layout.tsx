import { Link, Outlet } from "react-router";
import { useSession } from "./auth/AuthProvider";

export function Layout() {
  const { name, roles, signOut } = useSession();
  return (
    <div className="shell">
      <header className="topbar">
        <strong>geoMap</strong>
        <nav>
          {roles.includes("planificateur") && <Link to="/">Missions</Link>}
          {roles.includes("administrateur") && (
            <>
              <Link to="/admin/terminaux">Terminaux</Link>
              <Link to="/admin/fonds">Fonds de carte</Link>
            </>
          )}
        </nav>
        <span className="user">{name}</span>
        <button onClick={signOut}>Déconnexion</button>
      </header>
      <Outlet />
    </div>
  );
}
