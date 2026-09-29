export interface AppConfig {
  oidcAuthority: string;
  oidcClientId: string;
}

// Read at startup, not baked in at build time: the same build runs at every command post.
export async function loadConfig(): Promise<AppConfig> {
  const response = await fetch("/config.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`cannot load /config.json (HTTP ${response.status})`);
  const config = (await response.json()) as Partial<AppConfig>;
  if (!config.oidcAuthority || !config.oidcClientId) {
    throw new Error("/config.json must define oidcAuthority and oidcClientId");
  }
  return { oidcAuthority: config.oidcAuthority, oidcClientId: config.oidcClientId };
}
