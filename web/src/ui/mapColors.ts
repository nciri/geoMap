import tokens from "./tokens.json";
import { colorToken, type Tokens } from "./tokens";
import type { ResolvedTheme } from "./theme";

export const designTokens = tokens as Tokens;

// MapLibre paint properties take literal colours, not CSS variables.
export function mapColors(theme: ResolvedTheme) {
  const color = (name: string) => colorToken(designTokens, name, theme);
  return {
    feature: color("map-feature"),
    guide: color("map-guide"),
    empty: color("map-empty"),
    halo: color("map-halo"),
  };
}
