// @vitest-environment node
import { geomapTokens } from "./tokensPlugin";

it("serves the tokens as a virtual CSS module", () => {
  const plugin = geomapTokens();
  const resolveId = plugin.resolveId as (id: string) => string | undefined;
  const load = plugin.load as (
    this: { addWatchFile(f: string): void },
    id: string,
  ) => string | undefined;
  const id = resolveId("virtual:geomap-tokens.css");
  expect(id).toBe("\0virtual:geomap-tokens.css");
  const watched: string[] = [];
  expect(load.call({ addWatchFile: (f) => watched.push(f) }, id!)).toContain("--accent:");
  expect(watched[0]).toMatch(/tokens\.json$/);
  expect(resolveId("other")).toBeUndefined();
});
