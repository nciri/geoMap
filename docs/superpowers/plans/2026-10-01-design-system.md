# Design System Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page of the geoMap web app follows the ALIAS design system (Nuit/Jour themes, Sora/Inter/JetBrains Mono, icons, logo, `al-*` components), and the map follows the theme, with no change in behaviour.

**Architecture:** `web/src/ui/tokens.json` (verbatim copy of the design system) is turned into CSS custom properties by a pure function and served as the virtual module `virtual:geomap-tokens.css` by a Vite plugin. The design system's React 18 bundle is ported to typed React 19 components in `web/src/ui/`, with the `al-*` stylesheet. A small external store (`useTheme`) resolves Système/Nuit/Jour; the shell gets a sidebar and a header; the map picks the Protomaps `light` or `dark` flavour and is rebuilt, at the same view, when the theme changes.

**Tech Stack:** React 19.3, TypeScript 6.0.3, Vite 8.3, Vitest 5, Testing Library, MapLibre 6.11.2, @protomaps/basemaps 5.7.2, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-10-01-geomap-design-system-design.md`

**Design system source files** (downloaded 2026-10-01 from the artifact, read-only reference):
`/tmp/claude-1000/-home-younes-Documents-work-geoMap/c18419b1-6a98-4ea3-a597-c6f5475949eb/scratchpad/artifact-files/26df6a43-3edf-498b-ba65-6eba5a1ed252/project/` — referred to below as `$DS`. It holds `tokens.json`, `README.md`, `components/bundle.css`, `components/bundle.js`, `components/index.d.ts`, `fonts/*.woff2`.

## Global Constraints

- Branch `feature/design-system`; run everything from `web/` unless a step says otherwise.
- No resource may load from the Internet at runtime: fonts, sprites and icons are served by the app itself.
- `web/src/ui/tokens.json` is a byte-for-byte copy of `$DS/tokens.json`; never edit it by hand.
- UI copy is French; existing accessible names (button and link labels, `aria-label`s) stay unchanged, because the Playwright journeys select by them.
- Components keep the design system's API where the spec keeps a component (`Icon`, `Logo`, `Button`, `StatusBadge`, `Alert`, `SiteHeader`, `Sidebar`, `MapPanel`); console-only components (`ServiceTable`, `ServiceRow`, `CatalogItem`, `LinkIndicator`, `Meter`, `Progress`, `Locality`) are not ported.
- No hard-coded colour in `.ts`, `.tsx` or `.css` files outside `tokens.json`, except APP-6D symbol colours (norm), the MilStd renderer's own fallbacks inside `coalesce` in `symbolLayer.ts`, and the logo's SVG mask channels.
- Storage keys: `geomap.theme` (`"dark" | "light"`, absent = system), `geomap.sidebar.editor` and `geomap.sidebar.pages` (`"collapsed" | "expanded"`). Every storage access is wrapped in try/catch.
- Gate: `cd web && npm run check`, then `make check` and `make e2e` at the repo root. Conventional Commits, no AI attribution trailer, never `--no-verify`.
- **Ruling carried from planning:** the fonts go to `web/public/fonts/` (served as-is), not `web/src/ui/fonts/` as the spec wrote: CSS from a virtual module cannot resolve relative `url()`s, and public files keep the URLs stable. Same offline guarantee.

## Review Focus

1. **Collapsed sidebar:** the nav links must keep their accessible names (`Missions`, `Terminaux`, `Fonds de carte`) when only icons show — a screen reader user and the Playwright journeys click them by name. Pinned by a Task 4 test.
2. **Blocked storage or missing `matchMedia`** (private window, old engines, jsdom): theme and sidebar fall back to their defaults without throwing. Pinned by Task 3 tests.
3. **Theme change while editing** (an object being reshaped, a drawing mode active): no page error, the map comes back at the same view, the editor keeps working. Pinned by a Task 6 test and the Task 7 journey.
4. **A stored theme value that is not one of the expected ones** (`"blue"`, empty string) in `theme-init.js` and in the store: treated as system. Pinned by Task 3 tests.
5. **A `tokens.json` resync that brings a bad value** (alias to a missing token, colour missing in a theme, named colour): the build fails loudly naming the token, instead of shipping an unstyled page. Pinned by Task 1 tests.

---

### Task 1: Tokens pipeline and fonts

**Files:**
- Create: `web/src/ui/tokens.json` (copy of `$DS/tokens.json`)
- Create: `web/src/ui/tokens.ts`, `web/src/ui/tokens.test.ts`
- Create: `web/src/ui/tokensPlugin.ts`, `web/src/ui/tokensPlugin.test.ts`
- Create: `web/src/ui/virtual.d.ts`
- Create: `web/public/fonts/Sora-Variable.woff2`, `Inter-Variable.woff2`, `Inter-Variable-Italic.woff2`, `JetBrainsMono-Variable.woff2` (copies of `$DS/fonts/*`)
- Create: `web/public/fonts/LICENSES.md`, `OFL-Sora.txt`, `OFL-Inter.txt`, `OFL-JetBrainsMono.txt`
- Modify: `web/vite.config.ts`, `web/src/main.tsx`

**Interfaces:**
- Produces: `tokensCss(tokens: Tokens): string`; `type Tokens`; `type ThemeId = "dark" | "light"`; `colorToken(tokens: Tokens, name: string, theme: ThemeId): string` (resolved literal, used by Task 6); `geomapTokens(): Plugin` serving `virtual:geomap-tokens.css`.
- CSS custom properties: `--<color-token>` for every colour token; `--font-display`, `--font-sans`, `--font-mono`; `--space-1`…`--space-6`; `--radius-sm|md|lg|pill`; `--row-dense`, `--row`, `--touch-target`, `--header-height`, `--sidebar-width`, `--sidebar-collapsed`; `--shadow-overlay`.

- [ ] **Step 1: Copy the source files**

```bash
DS=/tmp/claude-1000/-home-younes-Documents-work-geoMap/c18419b1-6a98-4ea3-a597-c6f5475949eb/scratchpad/artifact-files/26df6a43-3edf-498b-ba65-6eba5a1ed252/project
mkdir -p src/ui public/fonts
cp "$DS/tokens.json" src/ui/tokens.json
cp "$DS"/fonts/*.woff2 public/fonts/
cmp "$DS/tokens.json" src/ui/tokens.json && ls -l public/fonts
```

Expected: no `cmp` output, four `.woff2` files.

Fetch the SIL OFL 1.1 licence texts, which carry each family's copyright line, from the upstream repositories: Inter (`https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt` → `OFL-Inter.txt`), JetBrains Mono (`https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/OFL.txt` → `OFL-JetBrainsMono.txt`), Sora (its upstream repository's `OFL.txt` → `OFL-Sora.txt`; find the repository via the Google Fonts `ofl/sora` directory `https://raw.githubusercontent.com/google/fonts/main/ofl/sora/OFL.txt` if needed). Write `LICENSES.md`:

```markdown
# Fonts

Copied from the geoMap design system (ALIAS) on 2026-10-01. Each family is licensed under the
SIL Open Font License 1.1; the licence texts, with their copyright lines, are next to this file.

| File | Family | Licence |
| --- | --- | --- |
| `Sora-Variable.woff2` | Sora | `OFL-Sora.txt` |
| `Inter-Variable.woff2`, `Inter-Variable-Italic.woff2` | Inter | `OFL-Inter.txt` |
| `JetBrainsMono-Variable.woff2` | JetBrains Mono | `OFL-JetBrainsMono.txt` |

Sources of the licence texts: <the three URLs actually used>.
```

- [ ] **Step 2: Write the failing tests**

`src/ui/tokens.test.ts`:

```ts
import tokens from "./tokens.json";
import { colorToken, tokensCss, type Tokens } from "./tokens";

const small: Tokens = {
  name: "t",
  version: 1,
  color: {
    themes: [
      { id: "dark", name: "Nuit" },
      { id: "light", name: "Jour" },
    ],
    tokens: [
      { name: "brand", value: { dark: "#ff6b00", light: "#ff6b00" }, usage: "" },
      { name: "accent", value: { dark: "{brand}", light: "#b84c00" }, usage: "" },
    ],
  },
  type: {
    fonts: [{ family: "Inter", file: "fonts/Inter-Variable.woff2", weight: "100 900", style: "normal" }],
    families: { display: "Sora, sans-serif", sans: "Inter, sans-serif", mono: "monospace" },
    groups: [],
  },
  spacing: { tokens: [{ name: "space-1", value: "4px", usage: "" }] },
  radius: { tokens: [{ name: "radius-sm", value: "4px", usage: "" }] },
  size: { tokens: [{ name: "row", value: "40px", usage: "" }] },
  shadow: {
    tokens: [
      { name: "shadow-overlay", value: { dark: "0 4px 16px #000", light: "0 1px 2px #fff" }, usage: "" },
    ],
  },
};

it("resolves aliases per theme", () => {
  expect(colorToken(small, "accent", "dark")).toBe("#ff6b00");
  expect(colorToken(small, "accent", "light")).toBe("#b84c00");
});

it("puts Jour on :root and Nuit under the system preference and the forced attribute", () => {
  const css = tokensCss(small);
  expect(css).toMatch(/:root,\s*:root\[data-theme="light"\]\s*\{[^}]*--accent: #b84c00;/);
  expect(css).toMatch(
    /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{[^}]*--accent: #ff6b00;/,
  );
  expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*--accent: #ff6b00;/);
});

it("declares fonts from the app's own public folder and the scale variables", () => {
  const css = tokensCss(small);
  expect(css).toContain('src: url("/fonts/Inter-Variable.woff2") format("woff2")');
  expect(css).toContain("font-weight: 100 900");
  expect(css).toContain("--font-sans: Inter, sans-serif;");
  expect(css).toContain("--space-1: 4px;");
  expect(css).toContain("--radius-sm: 4px;");
  expect(css).toContain("--row: 40px;");
  expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*--shadow-overlay: 0 4px 16px #000;/);
});

it("fails loudly on an alias to a missing token", () => {
  const broken = structuredClone(small);
  broken.color.tokens[1].value = { dark: "{nope}", light: "#000000" };
  expect(() => tokensCss(broken)).toThrow(/accent.*nope/);
});

it("fails loudly on a colour missing in a theme", () => {
  const broken = structuredClone(small);
  broken.color.tokens[0].value = { dark: "#ff6b00" };
  expect(() => tokensCss(broken)).toThrow(/brand.*light/);
});

it("fails loudly on a value that is not a colour", () => {
  const broken = structuredClone(small);
  broken.color.tokens[0].value = { dark: "red", light: "#ff6b00" };
  expect(() => tokensCss(broken)).toThrow(/brand/);
});

it("turns the real design system into CSS without error", () => {
  const css = tokensCss(tokens as Tokens);
  expect(css).toContain("--accent-text: #b84c00;");
  expect(css).toContain("--bg-000: #07131f;");
  expect(css).toContain("--font-mono:");
});
```

`src/ui/tokensPlugin.test.ts`:

```ts
import { geomapTokens } from "./tokensPlugin";

it("serves the tokens as a virtual CSS module", () => {
  const plugin = geomapTokens();
  const resolveId = plugin.resolveId as (id: string) => string | undefined;
  const load = plugin.load as (this: { addWatchFile(f: string): void }, id: string) => string | undefined;
  const id = resolveId("virtual:geomap-tokens.css");
  expect(id).toBe("\0virtual:geomap-tokens.css");
  const watched: string[] = [];
  expect(load.call({ addWatchFile: (f) => watched.push(f) }, id!)).toContain("--accent:");
  expect(watched[0]).toMatch(/tokens\.json$/);
  expect(resolveId("other")).toBeUndefined();
});
```

- [ ] **Step 3: Run the tests to watch them fail**

Run: `node_modules/.bin/vitest run src/ui`
Expected: FAIL — `Cannot find module './tokens'` / `'./tokensPlugin'`.

- [ ] **Step 4: Implement**

`src/ui/tokens.ts`:

```ts
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

export function colorToken(tokens: Tokens, name: string, theme: ThemeId, seen: string[] = []): string {
  const token = tokens.color.tokens.find((t) => t.name === name);
  if (!token) throw new Error(`design token ${seen.at(-1) ?? name}: alias to missing token ${name}`);
  if (seen.includes(name)) throw new Error(`design token ${name}: alias loop`);
  const raw = themed(token.value, theme);
  if (raw === undefined) throw new Error(`design token ${name}: no value for theme ${theme}`);
  const alias = ALIAS.exec(raw);
  if (alias) return colorToken(tokens, alias[1], theme, [...seen, name]);
  if (!COLOR.test(raw)) throw new Error(`design token ${name}: "${raw}" is not a colour`);
  return raw;
}

function themeBlock(tokens: Tokens, theme: ThemeId, indent: string): string {
  const colors = tokens.color.tokens.map((t) => `--${t.name}: ${colorToken(tokens, t.name, theme)};`);
  const shadows = tokens.shadow.tokens.map((t) => {
    const value = themed(t.value, theme);
    if (value === undefined) throw new Error(`design token ${t.name}: no value for theme ${theme}`);
    return `--${t.name}: ${value};`;
  });
  return [...colors, ...shadows].map((d) => indent + d).join("\n");
}

export function tokensCss(tokens: Tokens): string {
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
```

The design system lists font `file`s as `fonts/<name>.woff2`, served from `web/public/fonts/` at `/fonts/<name>.woff2`.

`src/ui/tokensPlugin.ts`:

```ts
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
```

`src/ui/virtual.d.ts`: `declare module "virtual:geomap-tokens.css";`

`vite.config.ts`: `import { geomapTokens } from "./src/ui/tokensPlugin";` and `plugins: [react(), geomapTokens()]`.

`src/main.tsx`: `import "virtual:geomap-tokens.css";` as the first CSS import, before `./index.css`.

- [ ] **Step 5: Run the tests and a build**

Run: `node_modules/.bin/vitest run src/ui && node_modules/.bin/vite build`
Expected: tests PASS; build succeeds; `grep -c -- "--accent" dist/assets/*.css` ≥ 1; `ls dist/fonts` lists the four `.woff2`.

- [ ] **Step 6: Gate and commit**

Run: `npx prettier --write src/ui vite.config.ts src/main.tsx && npm run check`
Expected: green.

```bash
git add web/src/ui web/public/fonts web/vite.config.ts web/src/main.tsx
git commit -m "feat(web): generate design tokens CSS from the design system's tokens.json"
```

---

### Task 2: Design system components (React 19 port)

**Files:**
- Create: `web/src/ui/icons.ts`, `web/src/ui/components.tsx`, `web/src/ui/components.test.tsx`, `web/src/ui/ui.css`
- Modify: `web/src/main.tsx`

**Interfaces:**
- Consumes: CSS variables from Task 1.
- Produces (exports of `src/ui/components.tsx`):
  - `type IconName` (64 names), `iconNames: IconName[]`
  - `Icon({ name, size = 20, title, className })`
  - `Logo({ variant = "lockup", tone = "auto", size = 32, appName })` — `variant: "lockup" | "mark" | "app-icon"`, `tone: "auto" | "color" | "duo" | "white" | "mono"`; accessible name `ALIAS` or `ALIAS <appName>`
  - `Button({ variant = "secondary", touch, icon, type = "button", ...buttonAttributes })` — `variant: "primary" | "secondary" | "ghost" | "irreversible"`
  - `type State = "ok" | "degraded" | "error" | "pending" | "unknown" | "revoked" | "blocked"`; `StatusBadge({ state = "unknown", children })`
  - `Alert({ severity = "info", title, time, children, who })` — `severity: "error" | "degraded" | "unknown" | "info"`, `who?: { role: string; step: string }`; `role="alert"` for errors, `role="status"` otherwise
  - `MapPanel({ className, style, children })`

`SiteHeader` and `Sidebar` are built in Task 4 (they need the router and the theme store).

- [ ] **Step 1: Write the failing tests**

`src/ui/components.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { Alert, Button, Icon, iconNames, Logo, MapPanel, StatusBadge } from "./components";

it("draws every icon of the set, decorative unless titled", () => {
  expect(iconNames).toHaveLength(64);
  for (const name of iconNames) {
    const { container, unmount } = render(<Icon name={name} />);
    const svg = container.querySelector("svg")!;
    expect(svg.innerHTML).not.toBe("");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    unmount();
  }
  render(<Icon name="missions" title="Missions" />);
  expect(screen.getByRole("img", { name: "Missions" })).toBeInTheDocument();
});

it("renders buttons in their variants, as plain buttons by default", () => {
  render(
    <>
      <Button variant="primary">Publier</Button>
      <Button variant="irreversible">Révoquer</Button>
      <Button disabled>Importer</Button>
      <Button type="submit">Envoyer</Button>
    </>,
  );
  expect(screen.getByRole("button", { name: "Publier" })).toHaveClass("al-btn", "al-btn--primary");
  expect(screen.getByRole("button", { name: /Révoquer/ })).toHaveClass("al-btn--irreversible");
  expect(screen.getByRole("button", { name: "Importer" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Publier" })).toHaveAttribute("type", "button");
  expect(screen.getByRole("button", { name: "Envoyer" })).toHaveAttribute("type", "submit");
});

it("labels states in French by default", () => {
  render(
    <>
      <StatusBadge state="ok" />
      <StatusBadge state="revoked" />
      <StatusBadge state="blocked">Brouillon</StatusBadge>
    </>,
  );
  expect(screen.getByText("Sain")).toHaveClass("al-status", "al-status--ok");
  expect(screen.getByText("Révoqué")).toHaveClass("al-status--revoked");
  expect(screen.getByText("Brouillon")).toHaveClass("al-status--blocked");
});

it("announces errors as alerts and the rest as status", () => {
  render(
    <>
      <Alert severity="error" title="Import refusé" who={{ role: "Administrateur", step: "réimporter" }}>
        Fichier tronqué.
      </Alert>
      <Alert title="Chargement…" />
    </>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Import refusé");
  expect(screen.getByRole("alert")).toHaveTextContent("Administrateur · réimporter");
  expect(screen.getByRole("status")).toHaveTextContent("Chargement…");
});

it("names the logo and floats map panels", () => {
  render(
    <>
      <Logo appName="geoMap" />
      <MapPanel className="x">contenu</MapPanel>
    </>,
  );
  expect(screen.getByRole("img", { name: "ALIAS geoMap" })).toBeInTheDocument();
  expect(screen.getByText("contenu")).toHaveClass("al-mappanel", "x");
});
```

- [ ] **Step 2: Run to watch them fail**

Run: `node_modules/.bin/vitest run src/ui/components.test.tsx`
Expected: FAIL — `Cannot find module './components'`.

- [ ] **Step 3: Port the components**

`src/ui/icons.ts`: copy the icon object `m` from `$DS/components/bundle.js` verbatim (its 64 keys and SVG markup strings, from `overview` to `measure`), and the logo geometry object `h` (`A`, `SWOOSH`):

```ts
// Line icons from the ALIAS design system: 20px grid, 1.5px stroke, drawn in currentColor.
export const ICONS = {
  overview:
    '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="4" rx="1"/><rect x="11" y="9" width="6" height="8" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/>',
  // …the 63 other entries of `m`, byte for byte
} as const;
export type IconName = keyof typeof ICONS;

// The ALIAS mark (redrawn from the brand board, pending validation against the official artwork).
export const LOGO_PATHS = {
  A: "M20.4 68.6 L45.4 24.6 Q48.8 19.2 52.2 24.6 L79.8 79 L68.4 79 L48.8 43.6 L30.8 71.4 Q26.6 76.2 20.4 68.6 Z",
  SWOOSH:
    "M16.2 79.8 C24.2 84.8 50.4 77.2 72.7 37.7 L71.5 36.7 C50.4 72.4 27.6 80.2 20.9 74.1 Q18.4 76.4 16.2 79.8 Z",
};
```

Verify the copy: `node -e` a one-off script that evaluates `bundle.js` in a stub `window` is not needed — instead check `Object.keys(ICONS).length === 64` (the test does) and eyeball three entries against `bundle.js`.

`src/ui/components.tsx`:

```tsx
import { useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { ICONS, LOGO_PATHS, type IconName } from "./icons";

export type { IconName };
export const iconNames = Object.keys(ICONS) as IconName[];
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

export function Icon({
  name,
  size = 20,
  title,
  className,
}: {
  name: IconName;
  size?: number;
  title?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("al-icon", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      // Static markup from ICONS only; no user data reaches it.
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

// The design system's own inks; #ffffff is its "white" tone for dark grounds.
const TONES = {
  color: ["var(--brand-orange)", "var(--brand-orange)"],
  duo: ["var(--brand-navy)", "var(--brand-orange)"],
  white: ["#ffffff", "var(--brand-orange)"],
  mono: ["currentColor", "currentColor"],
  auto: ["var(--text)", "var(--brand-orange)"],
} as const;
type Tone = keyof typeof TONES;

function Mark({ tone, size }: { tone: Tone; size: number }) {
  const mask = "alias-cut-" + useId().replace(/[^a-zA-Z0-9-]/g, "");
  const [ink, orbit] = TONES[tone];
  return (
    <svg viewBox="12 14 72 72" width={size} height={size} aria-hidden="true" className="al-logo__mark">
      <defs>
        {/* Mask channels: white keeps, black cuts the gap between the A and the orbit. */}
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#fff" />
          <path d={LOGO_PATHS.SWOOSH} fill="#000" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" />
        </mask>
      </defs>
      <path d={LOGO_PATHS.A} fill={ink} mask={`url(#${mask})`} />
      <path d={LOGO_PATHS.SWOOSH} fill={orbit} />
      <g fill={orbit}>
        <ellipse cx="74.9" cy="35.1" rx="3" ry="2.1" transform="rotate(-40 74.9 35.1)" />
        <circle cx="78.5" cy="32.2" r="0.9" />
      </g>
    </svg>
  );
}

export function Logo({
  variant = "lockup",
  tone = "auto",
  size = 32,
  appName,
}: {
  variant?: "lockup" | "mark" | "app-icon";
  tone?: Tone;
  size?: number;
  appName?: string;
}) {
  const label = appName ? `ALIAS ${appName}` : "ALIAS";
  if (variant === "app-icon") {
    return (
      <span className="al-logo al-logo--app" style={{ width: size, height: size }} role="img" aria-label={label}>
        <Mark tone="color" size={size * 0.78} />
      </span>
    );
  }
  const words =
    tone === "white" ? "#ffffff" : tone === "duo" ? "var(--brand-navy)" : tone === "mono" ? "currentColor" : "var(--text)";
  return (
    <span className={cx("al-logo", `al-logo--${variant}`)} role="img" aria-label={label}>
      <Mark tone={tone} size={size} />
      {variant === "lockup" && (
        <span className="al-logo__words" style={{ color: words }}>
          <span className="al-logo__name" style={{ fontSize: size * 0.5 }}>
            ALIAS
            {appName && <span className="al-logo__app"> · {appName}</span>}
          </span>
        </span>
      )}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "irreversible";
  touch?: boolean;
  icon?: IconName;
};

export function Button({
  variant = "secondary",
  touch = false,
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("al-btn", variant !== "secondary" && `al-btn--${variant}`, touch && "al-btn--touch", className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export type State = "ok" | "degraded" | "error" | "pending" | "unknown" | "revoked" | "blocked";
const STATE_LABELS: Record<State, string> = {
  ok: "Sain",
  degraded: "Dégradé",
  error: "En erreur",
  pending: "En attente",
  unknown: "Inconnu",
  revoked: "Révoqué",
  blocked: "Bloqué",
};

export function StatusBadge({ state = "unknown", children }: { state?: State; children?: ReactNode }) {
  return <span className={`al-status al-status--${state}`}>{children ?? STATE_LABELS[state]}</span>;
}

const ALERT_ICONS = { error: "error", degraded: "degraded", unknown: "unknown", info: "info" } as const;

export function Alert({
  severity = "info",
  title,
  time,
  children,
  who,
}: {
  severity?: keyof typeof ALERT_ICONS;
  title: string;
  time?: string;
  children?: ReactNode;
  who?: { role: string; step: string };
}) {
  return (
    <div
      className={cx("al-alert", severity !== "info" && `al-alert--${severity}`)}
      role={severity === "error" ? "alert" : "status"}
    >
      <span className="al-alert__glyph">
        <Icon name={ALERT_ICONS[severity]} size={18} />
      </span>
      <span className="al-alert__title">{title}</span>
      {time ? <span className="al-alert__time">{time}</span> : <span />}
      {children && <span className="al-alert__body">{children}</span>}
      {who && (
        <span className="al-alert__who">
          <b>{who.role}</b> · {who.step}
        </span>
      )}
    </div>
  );
}

export function MapPanel({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div className={cx("al-mappanel", className)} style={style}>
      {children}
    </div>
  );
}
```

`src/ui/ui.css`: copy `$DS/components/bundle.css`, then delete the blocks of excluded components: « Locality marker » (`.al-loc*`), « LinkIndicator » (`.al-link*`), the service-row rules (`.al-row__name`, `.al-row__sub`, `.al-row--unknown`, `.al-meter*`), « CatalogItem » (`.al-cat*`, `.al-progress*`) and `.al-version--revoked`. Keep `.al-table`, `.al-mono`, `.al-muted`, buttons, status, header, sidebar, alert, map frame/panel/coords/modeswitch, icon/logo/helpers. Move the `.al-root` rules onto `body` (the app has no `.al-root` wrapper) and drop the `.al-root *` rule (`index.css` already sets `box-sizing`).

`src/main.tsx`: `import "./ui/ui.css";` right after the tokens import.

- [ ] **Step 4: Run the tests**

Run: `node_modules/.bin/vitest run src/ui`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

Run: `npx prettier --write src/ui src/main.tsx && npm run check`
Expected: green.

```bash
git add web/src/ui web/src/main.tsx
git commit -m "feat(web): port the design system components to React 19"
```

---

### Task 3: Theme store and first paint

**Files:**
- Create: `web/src/ui/theme.ts`, `web/src/ui/theme.test.ts`
- Create: `web/public/theme-init.js`, `web/src/ui/themeInit.test.ts`
- Modify: `web/index.html`

**Interfaces:**
- Produces:
  - `type ThemePreference = "system" | "dark" | "light"`; `type ResolvedTheme = "dark" | "light"`
  - `useTheme(): { preference: ThemePreference; resolved: ResolvedTheme; setPreference(p: ThemePreference): void }`
  - `readPreference(): ThemePreference`
  - `setPreference` writes `geomap.theme` (removes it for `system`) and sets `data-theme` on `document.documentElement` (removed for `system`).

- [ ] **Step 1: Write the failing tests**

`src/ui/theme.test.ts` — the store keeps the preference in module state, so each test imports a fresh copy:

```ts
import { act, renderHook } from "@testing-library/react";

let dark = false;
const listeners = new Set<() => void>();

async function load() {
  vi.resetModules();
  return import("./theme");
}

beforeEach(() => {
  dark = false;
  listeners.clear();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === "(prefers-color-scheme: dark)" && dark;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => vi.restoreAllMocks());

it("follows the system until a theme is forced", async () => {
  dark = true;
  const { useTheme } = await load();
  const { result } = renderHook(() => useTheme());
  expect(result.current).toMatchObject({ preference: "system", resolved: "dark" });
  act(() => result.current.setPreference("light"));
  expect(result.current.resolved).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem("geomap.theme")).toBe("light");
  act(() => result.current.setPreference("system"));
  expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  expect(localStorage.getItem("geomap.theme")).toBeNull();
});

it("tracks a change of the system setting while on system", async () => {
  const { useTheme } = await load();
  const { result } = renderHook(() => useTheme());
  expect(result.current.resolved).toBe("light");
  act(() => {
    dark = true;
    listeners.forEach((l) => l());
  });
  expect(result.current.resolved).toBe("dark");
});

it("treats an unknown stored value as system", async () => {
  localStorage.setItem("geomap.theme", "blue");
  const { readPreference } = await load();
  expect(readPreference()).toBe("system");
});

it("works without storage or matchMedia", async () => {
  for (const method of ["getItem", "setItem", "removeItem"] as const) {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new Error("blocked");
    });
  }
  // @ts-expect-error simulating an engine without matchMedia
  delete window.matchMedia;
  const { useTheme } = await load();
  const { result } = renderHook(() => useTheme());
  expect(result.current).toMatchObject({ preference: "system", resolved: "light" });
  act(() => result.current.setPreference("dark"));
  expect(result.current.resolved).toBe("dark");
});
```

`src/ui/themeInit.test.ts`:

```ts
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../../public/theme-init.js", import.meta.url), "utf8");
const run = () => new Function(script)();

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

it("applies a forced theme before the app loads", () => {
  localStorage.setItem("geomap.theme", "dark");
  run();
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("leaves the system theme alone for unknown values", () => {
  localStorage.setItem("geomap.theme", "blue");
  run();
  expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
});
```

- [ ] **Step 2: Run to watch them fail**

Run: `node_modules/.bin/vitest run src/ui/theme.test.ts src/ui/themeInit.test.ts`
Expected: FAIL — module `./theme` and file `public/theme-init.js` missing.

- [ ] **Step 3: Implement**

`public/theme-init.js`:

```js
// Applies a forced theme before the app's first paint, so a Nuit user never sees a flash of Jour.
// A separate file, not an inline script, so a strict Content-Security-Policy can allow it.
try {
  var theme = localStorage.getItem("geomap.theme");
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
} catch (e) {
  // Storage blocked: the system theme applies.
}
```

`index.html`: in `<head>`, add `<meta name="color-scheme" content="light dark" />` and `<script src="/theme-init.js"></script>` (classic, blocking, before the module script).

`src/ui/theme.ts`:

```ts
import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

const KEY = "geomap.theme";
const QUERY = "(prefers-color-scheme: dark)";
const subscribers = new Set<() => void>();

export function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "dark" || stored === "light" ? stored : "system";
  } catch {
    return "system";
  }
}

// Also kept in memory: with storage blocked, a forced theme still holds until the tab closes.
let preference: ThemePreference = readPreference();

const media = () => (typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null);

function snapshot(): string {
  const resolved = preference === "system" ? (media()?.matches ? "dark" : "light") : preference;
  return `${preference}|${resolved}`;
}

function subscribe(onChange: () => void) {
  subscribers.add(onChange);
  const query = media();
  query?.addEventListener("change", onChange);
  return () => {
    subscribers.delete(onChange);
    query?.removeEventListener("change", onChange);
  };
}

function setPreference(next: ThemePreference) {
  preference = next;
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Not remembered across reloads, nothing else to do.
  }
  if (next === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = next;
  subscribers.forEach((notify) => notify());
}

export function useTheme() {
  const [current, resolved] = useSyncExternalStore(subscribe, snapshot).split("|") as [
    ThemePreference,
    ResolvedTheme,
  ];
  return { preference: current, resolved, setPreference };
}
```

- [ ] **Step 4: Run the tests**

Run: `node_modules/.bin/vitest run src/ui`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

Run: `npx prettier --write src/ui public/theme-init.js index.html && npm run check`
Expected: green.

```bash
git add web/src/ui web/public/theme-init.js web/index.html
git commit -m "feat(web): theme store following the system with a forced Nuit or Jour"
```

---

### Task 4: Shell — sidebar and header

**Files:**
- Create: `web/src/ui/Sidebar.tsx`, `web/src/ui/SiteHeader.tsx`, `web/src/ui/ThemeSwitch.tsx`, `web/src/Layout.test.tsx`
- Modify: `web/src/Layout.tsx`, `web/src/index.css`

**Interfaces:**
- Consumes: `Icon`, `Logo`, `Button`, `IconName` (Task 2); `useTheme` (Task 3); `useSession(): { name: string; roles: Role[]; signOut(): void }` from `src/auth/AuthProvider.tsx`.
- Produces:
  - `interface NavItem { id: string; label: string; icon: IconName; href: string }`
  - `Sidebar({ items, collapsed, onToggle }: { items: NavItem[]; collapsed: boolean; onToggle: () => void })` — `<nav aria-label="Navigation principale">` with react-router `NavLink`s (`aria-current="page"` from `NavLink`, `end` on `/`); toggle button named « Replier » / « Déplier ».
  - `useSidebarCollapsed(context: "editor" | "pages"): [boolean, () => void]` — defaults: editor collapsed, pages expanded; stored under `geomap.sidebar.<context>`.
  - `SiteHeader({ title, user, children }: { title: string; user: { initials: string; name: string; role: string }; children?: ReactNode })` — `title` in an `<h1>`; `children` before the user block.
  - `ThemeSwitch()` — `role="group" aria-label="Thème"`, buttons `Système`, `Nuit`, `Jour` with `aria-pressed`.

- [ ] **Step 1: Write the failing tests**

`src/Layout.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Layout } from "./Layout";

const session = { name: "Paul Planificateur", roles: ["planificateur"], signOut: vi.fn() };
vi.mock("./auth/AuthProvider", () => ({ useSession: () => session }));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <Layout />,
        children: [
          { path: "/", element: <p>liste</p> },
          { path: "/missions/:id", element: <p>éditeur</p> },
          { path: "/admin/terminaux", element: <p>terminaux</p> },
          { path: "/admin/fonds", element: <p>fonds</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  localStorage.clear();
  session.roles = ["planificateur"];
});

it("shows the planner's entries, the page title and who is signed in", () => {
  renderAt("/");
  const nav = screen.getByRole("navigation", { name: "Navigation principale" });
  expect(within(nav).getByRole("link", { name: "Missions" })).toHaveAttribute("aria-current", "page");
  expect(within(nav).queryByRole("link", { name: "Terminaux" })).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Missions" })).toBeInTheDocument();
  expect(screen.getByText("Paul Planificateur")).toBeInTheDocument();
  expect(screen.getByText("Planificateur")).toBeInTheDocument();
  expect(screen.getByText("PP")).toBeInTheDocument();
});

it("shows the administrator's entries", () => {
  session.roles = ["administrateur"];
  renderAt("/admin/fonds");
  expect(screen.getByRole("link", { name: "Terminaux" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Fonds de carte" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByText("Administrateur")).toBeInTheDocument();
});

it("collapses in the editor but keeps the links' names", async () => {
  renderAt("/missions/42");
  const nav = screen.getByRole("navigation", { name: "Navigation principale" });
  expect(nav).toHaveClass("al-sidebar--collapsed");
  expect(within(nav).getByRole("link", { name: "Missions" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Déplier" }));
  expect(nav).not.toHaveClass("al-sidebar--collapsed");
  expect(localStorage.getItem("geomap.sidebar.editor")).toBe("expanded");
});

it("switches the theme and signs out", async () => {
  renderAt("/");
  await userEvent.click(screen.getByRole("button", { name: "Nuit" }));
  expect(screen.getByRole("button", { name: "Nuit" })).toHaveAttribute("aria-pressed", "true");
  expect(document.documentElement.dataset.theme).toBe("dark");
  await userEvent.click(screen.getByRole("button", { name: "Déconnexion" }));
  expect(session.signOut).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to watch them fail**

Run: `node_modules/.bin/vitest run src/Layout.test.tsx`
Expected: FAIL — no navigation named « Navigation principale ».

- [ ] **Step 3: Implement**

`src/ui/Sidebar.tsx`:

```tsx
import { useState } from "react";
import { NavLink } from "react-router";
import { Icon, Logo, type IconName } from "./components";

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  href: string;
}

const DEFAULTS = { editor: true, pages: false };

function readCollapsed(context: "editor" | "pages"): boolean {
  try {
    const stored = localStorage.getItem(`geomap.sidebar.${context}`);
    return stored === null ? DEFAULTS[context] : stored === "collapsed";
  } catch {
    return DEFAULTS[context];
  }
}

export function useSidebarCollapsed(context: "editor" | "pages"): [boolean, () => void] {
  const [choices, setChoices] = useState(() => ({ editor: readCollapsed("editor"), pages: readCollapsed("pages") }));
  const collapsed = choices[context];
  const toggle = () => {
    try {
      localStorage.setItem(`geomap.sidebar.${context}`, collapsed ? "expanded" : "collapsed");
    } catch {
      // Not remembered, nothing else to do.
    }
    setChoices({ ...choices, [context]: !collapsed });
  };
  return [collapsed, toggle];
}

export function Sidebar({ items, collapsed, onToggle }: { items: NavItem[]; collapsed: boolean; onToggle: () => void }) {
  return (
    <nav className={collapsed ? "al-sidebar al-sidebar--collapsed" : "al-sidebar"} aria-label="Navigation principale">
      <div className="al-sidebar__brand">
        <Logo variant={collapsed ? "mark" : "lockup"} size={28} appName="geoMap" />
      </div>
      {items.map((item) => (
        <NavLink
          key={item.id}
          to={item.href}
          end={item.href === "/"}
          className="al-nav"
          title={collapsed ? item.label : undefined}
        >
          <span className="al-nav__icon">
            <Icon name={item.icon} />
          </span>
          {/* Hidden visually when collapsed, never from assistive technology. */}
          <span className={collapsed ? "al-sr" : "al-nav__label"}>{item.label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className="al-nav al-nav--toggle"
        onClick={onToggle}
        aria-label={collapsed ? "Déplier" : "Replier"}
      >
        <span className="al-nav__icon">
          <Icon name="collapse" />
        </span>
        {!collapsed && <span className="al-nav__label">Replier</span>}
      </button>
    </nav>
  );
}
```

`src/ui/ThemeSwitch.tsx`:

```tsx
import { useTheme, type ThemePreference } from "./theme";

const CHOICES: [ThemePreference, string][] = [
  ["system", "Système"],
  ["dark", "Nuit"],
  ["light", "Jour"],
];

export function ThemeSwitch() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="al-modeswitch" role="group" aria-label="Thème">
      {CHOICES.map(([value, label]) => (
        <button key={value} type="button" aria-pressed={preference === value} onClick={() => setPreference(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}
```

`src/ui/SiteHeader.tsx`:

```tsx
import type { ReactNode } from "react";

export function SiteHeader({
  title,
  user,
  children,
}: {
  title: string;
  user: { initials: string; name: string; role: string };
  children?: ReactNode;
}) {
  return (
    <header className="al-header">
      <h1 className="al-header__title">{title}</h1>
      <div className="al-header__spacer" />
      {children}
      <div className="al-header__user">
        <span className="al-avatar" aria-hidden="true">
          {user.initials}
        </span>
        <span>
          {user.name}
          <br />
          <span className="al-header__role">{user.role}</span>
        </span>
      </div>
    </header>
  );
}
```

`src/Layout.tsx`:

```tsx
import { Outlet, useLocation } from "react-router";
import { useSession } from "./auth/AuthProvider";
import { Button } from "./ui/components";
import { Sidebar, useSidebarCollapsed, type NavItem } from "./ui/Sidebar";
import { SiteHeader } from "./ui/SiteHeader";
import { ThemeSwitch } from "./ui/ThemeSwitch";

function titleOf(pathname: string): string {
  if (pathname.startsWith("/missions/")) return "Mission";
  if (pathname.startsWith("/admin/terminaux")) return "Terminaux";
  if (pathname.startsWith("/admin/fonds")) return "Fonds de carte";
  return "Missions";
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

export function Layout() {
  const { name, roles, signOut } = useSession();
  const { pathname } = useLocation();
  const [collapsed, toggle] = useSidebarCollapsed(pathname.startsWith("/missions/") ? "editor" : "pages");
  const planner = roles.includes("planificateur");
  const admin = roles.includes("administrateur");
  const items: NavItem[] = [
    ...(planner ? [{ id: "missions", label: "Missions", icon: "missions" as const, href: "/" }] : []),
    ...(admin
      ? [
          { id: "terminaux", label: "Terminaux", icon: "terminals" as const, href: "/admin/terminaux" },
          { id: "fonds", label: "Fonds de carte", icon: "basemaps" as const, href: "/admin/fonds" },
        ]
      : []),
  ];
  const role = [planner && "Planificateur", admin && "Administrateur"].filter(Boolean).join(" · ");
  return (
    <div className="shell">
      <Sidebar items={items} collapsed={collapsed} onToggle={toggle} />
      <div className="shell__main">
        <SiteHeader title={titleOf(pathname)} user={{ initials: initials(name), name, role }}>
          <ThemeSwitch />
          <Button onClick={signOut}>Déconnexion</Button>
        </SiteHeader>
        <Outlet />
      </div>
    </div>
  );
}
```

Pages keep their own `<h1>` until Task 5 turns them into section titles; the Layout test targets the header's heading only.

`src/index.css`: replace the `.shell` and `.topbar*` rules with:

```css
.shell {
  display: flex;
  height: 100%;
}
.shell__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.al-header__title {
  margin: 0;
  font: 600 18px/24px var(--font-display);
}
```

- [ ] **Step 4: Run all web tests**

Run: `node_modules/.bin/vitest run`
Expected: PASS. If `App.test.tsx` or `Home.test.tsx` selected the old top bar (`.topbar`, a `heading` named « geoMap »), point them at the same behaviour through the new shell; never drop an assertion.

- [ ] **Step 5: Gate and commit**

Run: `npx prettier --write src && npm run check`
Expected: green.

```bash
git add web/src
git commit -m "feat(web): design system shell with sidebar, header and theme switch"
```

---

### Task 5: Pages and panels

**Files:**
- Modify: `web/src/index.css` (rewritten over tokens), `web/src/format.ts`, `web/src/App.tsx`, `web/src/main.tsx`, `web/src/missions/MissionsPage.tsx`, `web/src/missions/MissionForm.tsx`, `web/src/admin/DevicesPage.tsx`, `web/src/admin/BasemapsPage.tsx`, `web/src/editor/MissionEditorPage.tsx` (panel only; map in Task 6), `web/src/editor/DrawToolbar.tsx`, `web/src/editor/PublicationPanel.tsx`, `web/src/editor/FeaturePanel.tsx`, `web/src/editor/AssignmentPanel.tsx`, `web/src/symbols/SymbolPicker.tsx`
- Test: the existing `*.test.tsx` next to each file, plus the assertions below.

**Interfaces:**
- Consumes: `Button`, `StatusBadge`, `Alert`, `Icon`, `type State` (Task 2).
- Produces: `missionState(status: MissionStatus): State` in `src/format.ts`.

- [ ] **Step 1: Write the failing tests**

`src/format.test.ts` (add):

```ts
import { missionState } from "./format";

it("maps a mission status to its design system state", () => {
  expect(missionState("DRAFT")).toBe("blocked");
  expect(missionState("PUBLISHED")).toBe("ok");
  expect(missionState("WITHDRAWN")).toBe("revoked");
});
```

In the test file that renders the missions list (find it with `grep -rl "MissionsPage" src --include=*.test.tsx`), in the test that shows a DRAFT mission, add:

```tsx
expect(await screen.findByText("Brouillon")).toHaveClass("al-status", "al-status--blocked");
```

`src/editor/PublicationPanel.test.tsx`, in the test rendering blocking errors:

```tsx
expect(screen.getByRole("button", { name: /Publier la version/ })).toHaveClass("al-btn--primary");
const errors = screen.getByRole("list", { name: "Erreurs bloquantes" });
expect(errors.querySelector(".al-status--error")).not.toBeNull();
```

`src/admin/DevicesPage.test.tsx`, in the test listing an enrolled device, then after clicking « Révoquer »:

```tsx
expect(screen.getByText("Enrôlé")).toHaveClass("al-status--ok");
// after the first click on « Révoquer »:
expect(screen.getByRole("button", { name: /Confirmer la révocation/ })).toHaveClass("al-btn--irreversible");
```

`src/editor/DrawToolbar.test.tsx` (add):

```tsx
it("shows each tool's icon next to its label", () => {
  render(<DrawToolbar mode="static" onMode={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Zone" }).querySelector("svg.al-icon")).not.toBeNull();
});
```

- [ ] **Step 2: Run to watch them fail**

Run: `node_modules/.bin/vitest run src/format.test.ts src/missions src/editor src/admin src/Home.test.tsx`
Expected: FAIL on each new assertion.

- [ ] **Step 3: Restyle**

`src/format.ts` (add):

```ts
import type { State } from "./ui/components";

const MISSION_STATES: Record<MissionStatus, State> = {
  DRAFT: "blocked",
  PUBLISHED: "ok",
  WITHDRAWN: "revoked",
};
export const missionState = (status: MissionStatus): State => MISSION_STATES[status];
```

Rules for every file of this task:

- Every `<button>` becomes `Button`, labels unchanged. `primary` for the one action a screen exists for: « Créer la mission », « Publier la version N », « Enregistrer le terminal », « Importer ». `irreversible` for the confirmations « Confirmer la suppression », « Confirmer la révocation », « Confirmer le retrait »; the first click (« Supprimer », « Révoquer », « Retirer la mission ») stays `secondary` since it only opens the confirmation. « Annuler » is `ghost`. Everything else `secondary`. MissionForm's submit keeps `type="submit"`.
- Tables get `className="al-table"`. Status cells: missions `<StatusBadge state={missionState(m.status)}>{STATUS_LABELS[m.status]}</StatusBadge>`; devices `<StatusBadge state="ok">Enrôlé</StatusBadge>` / `<StatusBadge state="revoked">Révoqué</StatusBadge>`; basemap kind `<StatusBadge state="blocked">{KIND_LABELS[b.kind]}</StatusBadge>` (the neutral outlined badge). Fingerprint, identifier and size cells get `className="al-mono"`.
- The editor panel's `<p>{STATUS_LABELS[current.status]}</p>` becomes the same `StatusBadge`.
- Page `<h1>`s in `MissionsPage`, `DevicesPage`, `BasemapsPage` become `<h2 className="section-title">` (the header carries the page title). The editor keeps `<h1>{current.name}</h1>` as its panel heading.
- `<p role="alert">{message}</p>` becomes `<Alert severity="error" title={message} />`; `<p role="status">{notice}</p>` becomes `<Alert title={notice} />`. Texts unchanged. Where a `title` attribute carried a technical cause, pass the cause as the `Alert`'s children.
- In the « Erreurs bloquantes » and « Avertissements » lists, prefix each item with `<StatusBadge state="error">Bloquant</StatusBadge>` or `<StatusBadge state="degraded">Avertissement</StatusBadge>`; keep the list `aria-label`s and item texts.
- `DrawToolbar`: `icon` per tool — `point: "draw-point"`, `linestring: "draw-line"`, `polygon: "draw-polygon"`, `circle: "crosshair"`; « Terminer » gets `"check"`.
- `FeaturePanel`: the suggestion `.badge` becomes `<StatusBadge state="pending">{its current text}</StatusBadge>`; keep every accessible name its tests use (read the file first).
- `App.tsx`: the `Suspense` fallback becomes `<Alert title="Chargement…" />`; `EditorLoadError` renders `<Alert severity="error" title="Impossible de charger l'éditeur." who={{ role: "Vous", step: "recharger la page" }} />` followed by the existing « Recharger » link. `MissionEditorPage`'s `<p>Chargement…</p>` becomes `<Alert title="Chargement…" />`.
- `main.tsx` config failure: `<Alert severity="error" title="Configuration introuvable" who={{ role: "Administrateur", step: "vérifier /config.json" }}>{String(error)}</Alert>` — `main.tsx` imports `Alert` from `./ui/components`.

`src/index.css` — replace the whole file (no colour literal):

```css
* {
  box-sizing: border-box;
}
html,
body,
#root {
  height: 100%;
  margin: 0;
}
a {
  color: var(--accent-text);
}
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
h1,
h2,
h3 {
  margin: 0 0 var(--space-3);
  font-family: var(--font-display);
  font-weight: 600;
}
h1 {
  font-size: 18px;
  line-height: 24px;
}
h2,
.section-title {
  font-size: 15px;
  line-height: 20px;
}
input,
select,
textarea {
  min-height: 32px;
  padding: 0 var(--space-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--bg-200);
  color: var(--text);
  font: inherit;
}
textarea {
  padding: var(--space-2);
}
label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  color: var(--text-muted);
  font-size: 12px;
  line-height: 16px;
}
.shell {
  display: flex;
  height: 100%;
}
.shell__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.al-header__title {
  margin: 0;
  font: 600 18px/24px var(--font-display);
}
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  overflow: auto;
}
.mission-form,
.admin-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: end;
  padding: var(--space-4);
  background: var(--bg-100);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}
.editor {
  display: flex;
  flex: 1;
  min-height: 0;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 22rem;
  padding: var(--space-4);
  overflow: auto;
  background: var(--bg-100);
  border-right: 1px solid var(--line);
}
.panel details > summary {
  cursor: pointer;
  font-weight: 600;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.toolbar [aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-text);
}
.features ul,
.publication ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.features li.selected .feature-item {
  background: var(--accent-soft);
  color: var(--accent-text);
  box-shadow: inset 3px 0 0 var(--accent);
}
.feature-item {
  width: 100%;
  padding: var(--space-1) var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.feature-item:hover {
  background: var(--bg-300);
}
.feature-details,
.symbol-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.symbol-picker button,
.symbol-picker small {
  display: block;
  text-align: left;
}
.symbol-picker .selected {
  color: var(--accent-text);
  font-weight: 600;
}
.symbol-icon {
  max-width: 64px;
}
```

Then append the current map rules (`.map-frame`, `.map-frame .map`, `.coordinates`, `.map-alerts`, `.map-alerts p`, `.mode-switch` if present) unchanged except replacing their colour literals with `var(--bg-100)` (backgrounds) — Task 6 rewrites them.

- [ ] **Step 4: Run all web tests**

Run: `node_modules/.bin/vitest run`
Expected: PASS. Where an existing test breaks only because a `<p>` became a `<div>` or a heading level changed, fix the selector to the same role and name; never drop an assertion.

- [ ] **Step 5: Gate and commit**

Run: `npx prettier --write src && npm run check && grep -rnE "#[0-9a-fA-F]{3,8}\b" src --include=*.css`
Expected: check green; grep prints nothing.

```bash
git add web/src
git commit -m "feat(web): restyle pages and panels with the design system"
```

---

### Task 6: Map follows the theme

**Files:**
- Create: `web/src/ui/mapColors.ts`, `web/src/ui/mapColors.test.ts`
- Create: `web/public/map-assets/sprites/v4/dark.json`, `dark.png`, `dark@2x.json`, `dark@2x.png`
- Modify: `web/public/map-assets/SOURCE.md`, `web/src/map/style.ts`, `web/src/map/style.test.ts`, `web/src/map/missionLayer.ts`, `web/src/map/symbolLayer.ts`, `web/src/map/MapView.tsx`, `web/src/map/MapView.test.tsx`, `web/src/map/ModeSwitch.tsx`, `web/src/map/CoordinateReadout.tsx`, `web/src/map/CoordinateReadout.test.tsx`, `web/src/editor/MissionEditorPage.tsx`, `web/src/editor/MissionEditorPage.test.tsx`, `web/src/index.css`

**Interfaces:**
- Consumes: `colorToken`, `type Tokens` and `tokens.json` (Task 1); `useTheme`, `type ResolvedTheme` (Task 3); `MapPanel`, `Alert` (Task 2).
- Produces:
  - `mapColors(theme: ResolvedTheme): { feature: string; guide: string; empty: string; halo: string }`
  - `basemapStyle(stack: { vector: StackLayer | null; imagery: StackLayer[]; theme: ResolvedTheme }): StyleSpecification`
  - `MapView` gets a required prop `theme: ResolvedTheme`.

- [ ] **Step 1: Fetch the dark sprite**

```bash
cd public/map-assets/sprites/v4
for f in dark.json dark.png dark@2x.json dark@2x.png; do
  curl -fsSLo "$f" "https://raw.githubusercontent.com/protomaps/basemaps-assets/028c18f713baecad011301ff7a69acc39bcc2ae7/sprites/v4/$f"
done
ls -l
```

Expected: four non-empty files. In `SOURCE.md`, change the sprite line to ``- `sprites/v4/light*`, `sprites/v4/dark*`: Protomaps light and dark sprites.`` and keep the licence paragraph (the legal review now covers both).

- [ ] **Step 2: Write the failing tests**

`src/ui/mapColors.test.ts`:

```ts
import { mapColors } from "./mapColors";

it("reads the map colours from the design tokens", () => {
  expect(mapColors("light")).toEqual({ feature: "#1e66f5", guide: "#6c6f85", empty: "#e8e4d8", halo: "#ffffff" });
  expect(mapColors("dark").feature).toBe("#1e66f5");
});
```

`src/map/style.test.ts` — update every existing `basemapStyle({ vector, imagery })` call to pass `theme: "light"`; make the existing font-coverage test run for both themes with `it.each(["light", "dark"] as const)`; add:

```ts
import { existsSync } from "node:fs";

const vector = { id: "v", name: "V", attribution: "" };

it.each(["light", "dark"] as const)("uses the %s flavour and a sprite the app serves", (theme) => {
  const style = basemapStyle({ vector, imagery: [], theme });
  expect(style.sprite).toBe(`${location.origin}/map-assets/sprites/v4/${theme}`);
  expect(existsSync(new URL(`../../public/map-assets/sprites/v4/${theme}.json`, import.meta.url))).toBe(true);
});

it("draws the dark flavour differently from the light one", () => {
  const paintOf = (theme: "light" | "dark") =>
    (basemapStyle({ vector, imagery: [], theme }).layers.find((l) => l.id === "earth") as { paint: unknown }).paint;
  expect(paintOf("dark")).not.toEqual(paintOf("light"));
});

it("fills an empty map with the design system's empty colour", () => {
  const style = basemapStyle({ vector: null, imagery: [], theme: "dark" });
  expect(style.layers[0]).toMatchObject({ type: "background", paint: { "background-color": "#e8e4d8" } });
});
```

(If the Protomaps layer list has no `earth` layer id, use the first `fill` layer of the style; check with a one-off `console.log` of `layers(...).map(l => l.id)` and remove it.)

`src/map/MapView.test.tsx` — the file mocks `maplibre-gl`. Extend its `Map` mock to record constructor options, expose `getCenter()` (returning `{ toArray: () => center }`), `getZoom()`, `getBearing()`, `getPitch()` from a settable `view`, record `fitBounds` calls and a `removed` flag. Then add:

```tsx
it("rebuilds the map at the same view when the theme changes", () => {
  const { rerender } = render(<MapView vector={vector} imagery={[]} mode="Carte" theme="light" />);
  const first = createdMaps.at(-1)!;
  first.view = { center: [2.3, 48.8], zoom: 13, bearing: 20, pitch: 0 };
  rerender(<MapView vector={vector} imagery={[]} mode="Carte" theme="dark" />);
  expect(first.removed).toBe(true);
  const second = createdMaps.at(-1)!;
  expect(second).not.toBe(first);
  expect(second.options).toMatchObject({ center: [2.3, 48.8], zoom: 13, bearing: 20, pitch: 0 });
  expect(second.options.style.sprite).toMatch(/sprites\/v4\/dark$/);
  expect(second.fitBoundsCalls).toHaveLength(0);
});
```

Name the mock's collection and fields to match the file; every existing `MapView` render in the file gets `theme="light"`.

`src/editor/MissionEditorPage.test.tsx` — add, using the file's existing MapView/maplibre mocks and fixtures:

```tsx
import { act } from "@testing-library/react";
import { useTheme } from "../ui/theme";

it("keeps the editor working when the theme changes while an object is selected", async () => {
  // render the editor with one feature, as the file's other tests do, and select it through its list button
  // …existing setup…
  const { result } = renderHook(() => useTheme());
  act(() => result.current.setPreference("dark"));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("heading", { name: /Objets/ })).toBeInTheDocument();
});
```

Write the setup concretely from the file's existing « select a feature » test.

`src/map/CoordinateReadout.test.tsx` — keep its text assertions; add `expect(screen.getByText("MGRS")).toHaveClass("al-coords__k");` in the test that shows a position.

- [ ] **Step 3: Run to watch them fail**

Run: `node_modules/.bin/vitest run src/ui/mapColors.test.ts src/map src/editor/MissionEditorPage.test.tsx`
Expected: FAIL — no `mapColors`, `basemapStyle` ignores `theme`, `MapView` has no `theme`, no `al-coords__k`.

- [ ] **Step 4: Implement**

`src/ui/mapColors.ts`:

```ts
import tokens from "./tokens.json";
import { colorToken, type Tokens } from "./tokens";
import type { ResolvedTheme } from "./theme";

// MapLibre paint properties take literal colours, not CSS variables.
export function mapColors(theme: ResolvedTheme) {
  const color = (name: string) => colorToken(tokens as Tokens, name, theme);
  return { feature: color("map-feature"), guide: color("map-guide"), empty: color("map-empty"), halo: color("map-halo") };
}
```

`src/map/style.ts`: add `theme: ResolvedTheme` to `basemapStyle`'s argument; `namedFlavor(stack.theme)`; `sprite: \`${assets}/sprites/v4/${stack.theme}\``; background `mapColors(stack.theme).empty`.

`src/map/missionLayer.ts`: `DEFAULT_COLOR = mapColors("light").feature` (identical in both themes); `"#ffffff"` → `mapColors("light").halo`; `"#6c6f85"` → `mapColors("light").guide`; `SUGGESTION_COLOR = colorToken(tokens as Tokens, "status-degraded", "light")` (an AI suggestion awaiting review, told apart from features by lightness). `src/map/symbolLayer.ts`: `"circle-color": "#6c6f85"` → guide, halos `"#ffffff"` → halo; keep `"#000000"` and `"#ffffff"` inside the `coalesce` fallbacks (MilStd renderer defaults).

`src/map/MapView.tsx`:
- Import `type ResolvedTheme`; add required prop `theme`; keep it in `stackRef` next to `vector`/`imagery`.
- `const viewRef = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number } | null>(null);`
- The creation effect's dependency list becomes `[stackKey, theme]`; `basemapStyle({ vector, imagery, theme })`.
- In its cleanup, before `created.remove()`: `viewRef.current = { center: created.getCenter().toArray() as [number, number], zoom: created.getZoom(), bearing: created.getBearing(), pitch: created.getPitch() };`
- At creation: `const view = viewRef.current;` → `new maplibregl.Map({ container, style, ...(view ?? { center: [2.35, 46.6], zoom: 5 }) })`; when `view` is set, skip both `fitBounds` calls (initial bounds and header fit). The editor remounts `MapView` (new `key`) when the mission's layers change, so `viewRef` starts empty then, as today.
- Alerts: inside `.map-alerts`, each message becomes `<MapPanel key=…><Alert severity="error" title="Fond de carte illisible : le serveur ne l'a pas fourni.">{basemapError}</Alert></MapPanel>` and `<MapPanel key={error.id}><Alert severity="error" title={\`Imagerie illisible : ${error.name}\`}>{error.cause}</Alert></MapPanel>` — same visible titles, still `role="alert"`.
- `<div className="map-frame" data-map-theme={theme}>`.

`src/map/ModeSwitch.tsx`:

```tsx
import { MapPanel } from "../ui/components";
import type { MapMode } from "./mapModes";

const MODES: MapMode[] = ["Carte", "Satellite", "Hybride"];

export function ModeSwitch({ mode, hasImagery, onMode }: { mode: MapMode; hasImagery: boolean; onMode: (mode: MapMode) => void }) {
  return (
    <MapPanel className="map-mode">
      <div className="al-modeswitch" role="group" aria-label="Vue">
        {MODES.map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} disabled={m !== "Carte" && !hasImagery} onClick={() => onMode(m)}>
            {m}
          </button>
        ))}
      </div>
    </MapPanel>
  );
}
```

`src/map/CoordinateReadout.tsx`:

```tsx
import { MapPanel } from "../ui/components";
import { formatLatLon, formatMgrs } from "./coordinates";

export function CoordinateReadout({ position }: { position: { lng: number; lat: number } | null }) {
  return (
    <MapPanel className="map-coords">
      <div className="al-coords" aria-live="polite">
        {position ? (
          <>
            <span>
              <span className="al-coords__k">MGRS</span>
              {formatMgrs(position.lng, position.lat)}
            </span>
            <span>
              <span className="al-coords__k">LAT/LON</span>
              {formatLatLon(position.lng, position.lat)}
            </span>
          </>
        ) : (
          "Survolez la carte"
        )}
      </div>
    </MapPanel>
  );
}
```

The e2e journeys read the readout's text (`31U DQ …`, lat/lon); the added `MGRS`/`LAT/LON` keys must not break them — check `web/e2e/*.ts` for readout assertions and anchor them on the coordinate text if they used whole-element equality.

`src/editor/MissionEditorPage.tsx`: `const { resolved: theme } = useTheme();`, pass `theme={theme}` to `MapView`. In `onReady`, after `setMap(ready)`, if `selectedIdRef.current` is set, call `select(null)` (the reshaped object was on the removed map; same outcome as a basemap switch).

`src/index.css`: replace the map rules appended in Task 5 with:

```css
.map-frame {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--bg-000);
}
.map-frame .map {
  /* Outranks maplibre-gl.css (.maplibregl-map is relative), which the lazy map chunk loads last. */
  position: absolute;
  inset: 0;
}
.map-mode {
  top: var(--space-3);
  right: 56px;
  z-index: 2;
}
.map-coords {
  right: var(--space-3);
  bottom: 28px;
  z-index: 2;
}
.map-alerts {
  position: absolute;
  top: var(--space-3);
  left: 50%;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  transform: translateX(-50%);
}
.map-alerts .al-mappanel {
  position: static;
}
.maplibregl-ctrl-group {
  background: var(--bg-100);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-overlay);
}
.maplibregl-ctrl-group button + button {
  border-top-color: var(--line);
}
[data-map-theme="dark"] .maplibregl-ctrl-group .maplibregl-ctrl-icon {
  filter: invert(1);
}
.maplibregl-ctrl-attrib,
.maplibregl-ctrl-scale {
  background: var(--bg-100);
  color: var(--text-muted);
  border-color: var(--line-strong);
}
.maplibregl-ctrl-attrib a {
  color: var(--accent-text);
}
```

- [ ] **Step 5: Run the tests**

Run: `node_modules/.bin/vitest run`
Expected: PASS.

- [ ] **Step 6: Gate and commit**

Run: `npx prettier --write src public/map-assets/SOURCE.md && npm run check`
Expected: green.

```bash
git add web/src web/public/map-assets
git commit -m "feat(web): map follows the Nuit or Jour theme and keeps its view on switch"
```

---

### Task 7: End-to-end theme journey and final gate

**Files:**
- Create: `web/e2e/theme.spec.ts`
- Modify: other `web/e2e/*.spec.ts` selectors only if a run proves a label changed.

**Interfaces:**
- Consumes: everything above; `test`/`expect` from `web/e2e/fixtures.ts` (fails on page errors); `signIn` from `web/e2e/helpers.ts`; `mapPoint` from `web/e2e/map.ts`; the fixture `web/e2e/fixtures/vector.pmtiles`.

- [ ] **Step 1: Write the journey**

`web/e2e/theme.spec.ts`:

```ts
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { signIn } from "./helpers";
import { mapPoint } from "./map";

test.describe.configure({ mode: "serial" });
const suffix = randomBytes(3).toString("hex");

test("an administrator imports a basemap for the theme journey", async ({ page }) => {
  await signIn(page, "admin");
  await page.getByRole("link", { name: "Fonds de carte" }).click();
  await page.getByLabel("Identifiant").fill(`theme-${suffix}`);
  await page.getByLabel("Nom").fill(`Thème ${suffix}`);
  await page.getByLabel("Fichier PMTiles").setInputFiles({
    name: "theme.pmtiles",
    mimeType: "application/octet-stream",
    buffer: readFileSync("e2e/fixtures/vector.pmtiles"),
  });
  await page.getByRole("button", { name: "Importer" }).click();
  await expect(page.getByRole("status")).toContainText(`Thème ${suffix}`);
});

test("a planner switches theme while editing and the map stays where it was", async ({ page }) => {
  await signIn(page, "planner");
  await page.getByRole("button", { name: "Nuit", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByLabel("Nom").fill(`Op Thème ${suffix}`);
  await page.getByLabel("Fond de carte").selectOption({ label: `Thème ${suffix}` });
  await page.getByRole("button", { name: "Créer la mission" }).click();
  await page.getByRole("link", { name: `Op Thème ${suffix}` }).click();
  await expect(page.getByRole("button", { name: "Zone", exact: true })).toBeEnabled();
  await expect(page.locator(".maplibregl-ctrl-scale")).not.toContainText("km");

  await page.getByRole("button", { name: "Point", exact: true }).click();
  await mapPoint(page, 0.5, 0.5);
  await expect(page.getByRole("button", { name: /Sans nom.*Point/ })).toBeVisible();
  const scale = await page.locator(".maplibregl-ctrl-scale").textContent();

  await page.getByRole("button", { name: "Jour", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Zone", exact: true })).toBeEnabled();
  await expect(page.locator(".maplibregl-ctrl-scale")).toHaveText(scale!);
  await expect(page.getByRole("button", { name: /Sans nom.*Point/ })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.getByRole("button", { name: "Nuit", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Nuit", exact: true })).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 2: Run the suite**

**Before running:** a local dev stack may hold ports 58080/5173 and the `geomap-e2e-*` containers with a user's data; `make e2e` tears those containers down with `-v`. If the ports are busy or those containers are up, stop and report BLOCKED; never stop or remove anything yourself.

Run (repo root): `make e2e`
Expected: 9 tests PASS (smoke 2, journey 3, imagery 2, theme 2); no containers left. If a journey fails on a button name because of the `⚠` pseudo-element of irreversible buttons, switch that selector to a regex (`{ name: /Confirmer la révocation/ }`) and say so in the report.

- [ ] **Step 3: Final gate and commit**

Run: `cd web && npx prettier --write e2e && npm run check && cd .. && make check`
Expected: all green.

```bash
git add web/e2e
git commit -m "test(web): end-to-end theme switch while editing a mission"
```
