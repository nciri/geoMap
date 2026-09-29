import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // The lazy map chunk (maplibre-gl alone is ~800 kB) is served over the LAN when a mission opens.
    chunkSizeWarningLimit: 1300,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "map",
              test: /node_modules[\\/](maplibre-gl|pmtiles|terra-draw|terra-draw-maplibre-gl-adapter)[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    // e2e points the proxy at its own server port so a local service on 8080 does not collide.
    proxy: { "/api": process.env.GEOMAP_DEV_API_PROXY ?? "http://localhost:8080" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
