export type ThemeId = "dark" | "light";
type Themed = string | Partial<Record<ThemeId, string>>;
type Scale = { tokens: { name: string; value: string; usage: string }[] };

export interface Tokens {
  name: string;
  version: number;
  color: {
    themes: { id: string; name: string }[];
    tokens: { name: string; value: Themed; usage: string }[];
  };
  type: {
    fonts: { family: string; file: string; weight: string; style: string }[];
    families: Record<string, string>;
    groups: unknown[];
  };
  spacing: Scale;
  radius: Scale;
  size: Scale;
  shadow: { tokens: { name: string; value: Themed; usage: string }[] };
}

const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch)\([^()]*\))$/i;
const ALIAS = /^\{([A-Za-z0-9][A-Za-z0-9_.-]*)\}$/;

function themed(value: Themed, theme: ThemeId): string | undefined {
  return typeof value === "string" ? value : value[theme];
}

export function colorToken(
  tokens: Tokens,
  name: string,
  theme: ThemeId,
  seen: string[] = [],
): string {
  const token = tokens.color.tokens.find((t) => t.name === name);
  if (!token)
    throw new Error(`design token ${seen.at(-1) ?? name}: alias to missing token ${name}`);
  if (seen.includes(name)) throw new Error(`design token ${name}: alias loop`);
  const raw = themed(token.value, theme);
  if (raw === undefined) throw new Error(`design token ${name}: no value for theme ${theme}`);
  const alias = ALIAS.exec(raw);
  if (alias) return colorToken(tokens, alias[1], theme, [...seen, name]);
  if (!COLOR.test(raw)) throw new Error(`design token ${name}: "${raw}" is not a colour`);
  return raw;
}

function themeBlock(tokens: Tokens, theme: ThemeId, indent: string): string {
  const colors = tokens.color.tokens.map(
    (t) => `--${t.name}: ${colorToken(tokens, t.name, theme)};`,
  );
  const shadows = tokens.shadow.tokens.map((t) => {
    const value = themed(t.value, theme);
    if (value === undefined) throw new Error(`design token ${t.name}: no value for theme ${theme}`);
    return `--${t.name}: ${value};`;
  });
  return [...colors, ...shadows].map((d) => indent + d).join("\n");
}

export function tokensCss(tokens: Tokens): string {
  // Font files live in web/public, served at the root: "fonts/x.woff2" becomes "/fonts/x.woff2".
  const fonts = tokens.type.fonts.map(
    (f) =>
      `@font-face {\n  font-family: "${f.family}";\n  src: url("/${f.file}") format("woff2");\n` +
      `  font-weight: ${f.weight};\n  font-style: ${f.style};\n  font-display: swap;\n}`,
  );
  const scale = [
    ...Object.entries(tokens.type.families).map(([k, v]) => `--font-${k}: ${v};`),
    ...[tokens.spacing, tokens.radius, tokens.size].flatMap((family) =>
      family.tokens.map((t) => `--${t.name}: ${t.value};`),
    ),
  ]
    .map((d) => "  " + d)
    .join("\n");
  return [
    ...fonts,
    `:root {\n${scale}\n  color-scheme: light dark;\n}`,
    `:root,\n:root[data-theme="light"] {\n${themeBlock(tokens, "light", "  ")}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${themeBlock(tokens, "dark", "    ")}\n  }\n}`,
    `:root[data-theme="dark"] {\n${themeBlock(tokens, "dark", "  ")}\n}`,
  ].join("\n\n");
}
