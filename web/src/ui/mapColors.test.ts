import { mapColors } from "./mapColors";

it("reads the map colours from the design tokens", () => {
  expect(mapColors("light")).toEqual({
    feature: "#1e66f5",
    guide: "#6c6f85",
    empty: "#e8e4d8",
    halo: "#ffffff",
  });
  expect(mapColors("dark").feature).toBe("#1e66f5");
});
