import { lazy, Suspense, useMemo } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequireRole } from "./auth/AuthProvider";
import { Layout } from "./Layout";
import { MissionsPage } from "./missions/MissionsPage";

// The editor pulls in the map libraries, which the missions list does not need.
const MissionEditorPage = lazy(() =>
  import("./editor/MissionEditorPage").then((m) => ({ default: m.MissionEditorPage })),
);

const queryClient = new QueryClient();

export function App() {
  // Created after sign-in so the router starts from the page restored by the OIDC callback.
  const router = useMemo(
    () =>
      createBrowserRouter([
        {
          element: <Layout />,
          children: [
            {
              path: "/",
              element: (
                <RequireRole role="planificateur">
                  <MissionsPage />
                </RequireRole>
              ),
            },
            {
              path: "/missions/:missionId",
              element: (
                <RequireRole role="planificateur">
                  <Suspense fallback={<p>Chargement…</p>}>
                    <MissionEditorPage />
                  </Suspense>
                </RequireRole>
              ),
            },
          ],
        },
      ]),
    [],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
