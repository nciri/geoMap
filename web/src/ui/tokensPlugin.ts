import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { tokensCss, type Tokens } from "./tokens";

const ID = "virtual:geomap-tokens.css";
const RESOLVED = "\0" + ID;
const FILE = fileURLToPath(new URL("./tokens.json", import.meta.url));

export function geomapTokens(): Plugin {
  return {
    name: "geomap-tokens",
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return undefined;
      // A resync of tokens.json reloads the page in dev.
      this.addWatchFile(FILE);
      return tokensCss(JSON.parse(readFileSync(FILE, "utf8")) as Tokens);
    },
  };
}
