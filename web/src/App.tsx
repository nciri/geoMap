import { useMemo } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequireRole } from "./auth/AuthProvider";
import { Layout } from "./Layout";
import { MissionsPage } from "./missions/MissionsPage";

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
