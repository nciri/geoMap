// Generates the e2e secrets once per machine; they never leave e2e/.env.e2e (gitignored).
import { existsSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, randomBytes } from "node:crypto";

const file = new URL(".env.e2e", import.meta.url);
if (existsSync(file)) process.exit(0);

const secret = () => randomBytes(18).toString("base64url");
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = (key, type) => key.export({ type, format: "pem" }).trim().replaceAll("\n", "\\n");

const values = {
  KC_BOOTSTRAP_ADMIN_USERNAME: "kcadmin",
  KC_BOOTSTRAP_ADMIN_PASSWORD: secret(),
  E2E_PLANNER_PASSWORD: secret(),
  E2E_ADMIN_PASSWORD: secret(),
  POSTGRES_PASSWORD: secret(),
  MINIO_ROOT_USER: "geomap",
  MINIO_ROOT_PASSWORD: secret(),
  GEOMAP_SIGNING_PRIVATE_KEY_PEM: pem(privateKey, "pkcs8"),
  GEOMAP_SIGNING_PUBLIC_KEY_PEM: pem(publicKey, "spki"),
};
writeFileSync(
  file,
  Object.entries(values)
    .map(([key, value]) => `${key}="${value}"`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
