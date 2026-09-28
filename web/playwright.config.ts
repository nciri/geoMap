import { defineConfig, devices } from "@playwright/test";

process.loadEnvFile("e2e/.env.e2e");
const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing: run node e2e/setup-env.mjs`);
  return value;
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "./gradlew bootRun",
      cwd: "../server",
      url: "http://localhost:58080/actuator/health",
      timeout: 240_000,
      env: {
        SERVER_PORT: "58080",
        SPRING_DATASOURCE_URL: "jdbc:postgresql://localhost:55432/geomap",
        SPRING_DATASOURCE_USERNAME: "geomap",
        SPRING_DATASOURCE_PASSWORD: env("POSTGRES_PASSWORD"),
        SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI: "http://localhost:8180/realms/geomap",
        GEOMAP_SIGNING_PRIVATE_KEY_PEM: env("GEOMAP_SIGNING_PRIVATE_KEY_PEM"),
        GEOMAP_SIGNING_PUBLIC_KEY_PEM: env("GEOMAP_SIGNING_PUBLIC_KEY_PEM"),
        GEOMAP_STORAGE_ENDPOINT: "http://localhost:59000",
        GEOMAP_STORAGE_ACCESS_KEY: env("MINIO_ROOT_USER"),
        GEOMAP_STORAGE_SECRET_KEY: env("MINIO_ROOT_PASSWORD"),
        GEOMAP_STORAGE_BUCKET: "geomap-e2e",
      },
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      timeout: 60_000,
      env: { GEOMAP_DEV_API_PROXY: "http://localhost:58080" },
    },
  ],
});
