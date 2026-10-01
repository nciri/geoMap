import { readFileSync } from "node:fs";

const script = readFileSync("public/theme-init.js", "utf8");
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
