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
    fonts: [
      { family: "Inter", file: "fonts/Inter-Variable.woff2", weight: "100 900", style: "normal" },
    ],
    families: { display: "Sora, sans-serif", sans: "Inter, sans-serif", mono: "monospace" },
    groups: [],
  },
  spacing: { tokens: [{ name: "space-1", value: "4px", usage: "" }] },
  radius: { tokens: [{ name: "radius-sm", value: "4px", usage: "" }] },
  size: { tokens: [{ name: "row", value: "40px", usage: "" }] },
  shadow: {
    tokens: [
      {
        name: "shadow-overlay",
        value: { dark: "0 4px 16px #000", light: "0 1px 2px #fff" },
        usage: "",
      },
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
