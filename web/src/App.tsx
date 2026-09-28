import { lazy, Suspense, useMemo } from "react";
import { createBrowserRouter, RouterProvider, useLocation, type RouteObject } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequireRole } from "./auth/AuthProvider";
import { Layout } from "./Layout";
import { Home } from "./Home";
import { DevicesPage } from "./admin/DevicesPage";
import { BasemapsPage } from "./admin/BasemapsPage";

// The editor pulls in the map libraries, which the missions list does not need.
const MissionEditorPage = lazy(() =>
  import("./editor/MissionEditorPage").then((m) => ({ default: m.MissionEditorPage })),
);

// A redeploy renames the chunks, so a tab opened earlier fails to import the editor until reloaded.
function EditorLoadError() {
  const { pathname, search } = useLocation();
  return (
    <>
      <p role="alert">Impossible de charger l'éditeur.</p>
      <a href={pathname + search}>Recharger</a>
    </>
  );
}

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
      {
        path: "/missions/:missionId",
        errorElement: <EditorLoadError />,
        element: (
          <RequireRole role="planificateur">
            <Suspense fallback={<p>Chargement…</p>}>
              <MissionEditorPage />
            </Suspense>
          </RequireRole>
        ),
      },
      {
        path: "/admin/terminaux",
        element: (
          <RequireRole role="administrateur">
            <DevicesPage />
          </RequireRole>
        ),
      },
      {
        path: "/admin/fonds",
        element: (
          <RequireRole role="administrateur">
            <BasemapsPage />
          </RequireRole>
        ),
      },
    ],
  },
];

const queryClient = new QueryClient();

export function App() {
  // Created after sign-in so the router starts from the page restored by the OIDC callback.
  const router = useMemo(() => createBrowserRouter(routes), []);
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
