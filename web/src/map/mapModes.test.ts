import { effectiveMode, loadMode, saveMode, visibility } from "./mapModes";

it("shows the vector map alone in Carte", () => {
  expect(visibility("water", false, "Carte")).toBe("visible");
  expect(visibility("roads_major", true, "Carte")).toBe("visible");
  expect(visibility("imagery-paris", false, "Carte")).toBe("none");
});

it("shows imagery over the base in Satellite, without roads or labels", () => {
  expect(visibility("water", false, "Satellite")).toBe("visible");
  expect(visibility("imagery-paris", false, "Satellite")).toBe("visible");
  expect(visibility("places_locality", true, "Satellite")).toBe("none");
});

it("adds roads and labels over imagery in Hybride", () => {
  expect(visibility("imagery-paris", false, "Hybride")).toBe("visible");
  expect(visibility("places_locality", true, "Hybride")).toBe("visible");
});

it("falls back to Carte when the mission has no imagery", () => {
  expect(effectiveMode("Hybride", false)).toBe("Carte");
  expect(effectiveMode("Hybride", true)).toBe("Hybride");
});

it("remembers the mode per browser and survives a blocked storage", () => {
  saveMode("Satellite");
  expect(loadMode()).toBe("Satellite");
  const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(loadMode()).toBe("Carte");
  spy.mockRestore();
  localStorage.clear();
});
