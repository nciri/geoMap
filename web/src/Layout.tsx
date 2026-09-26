import { Link, Outlet } from "react-router";
import { useSession } from "./auth/AuthProvider";

export function Layout() {
  const { name, signOut } = useSession();
  return (
    <div className="shell">
      <header className="topbar">
        <strong>geoMap</strong>
        <nav>
          <Link to="/">Missions</Link>
        </nav>
        <span className="user">{name}</span>
        <button onClick={signOut}>Déconnexion</button>
      </header>
      <Outlet />
    </div>
  );
}
