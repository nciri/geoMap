import { Navigate } from "react-router";
import { RequireRole, useSession } from "./auth/AuthProvider";
import { MissionsPage } from "./missions/MissionsPage";

export function Home() {
  const { roles } = useSession();
  if (!roles.includes("planificateur") && roles.includes("administrateur")) {
    return <Navigate to="/admin/terminaux" replace />;
  }
  return (
    <RequireRole role="planificateur">
      <MissionsPage />
    </RequireRole>
  );
}
