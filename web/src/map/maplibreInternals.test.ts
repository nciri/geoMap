import * as maplibregl from "maplibre-gl";

// useDrawing and MissionEditorPage read maplibre's private `_removed` flag to leave a removed map
// alone; a maplibre upgrade that renames it must fail here instead of throwing at runtime.
// jsdom has no WebGL, so the painter is stubbed with just what construction and remove() touch.
it("flags a removed map with _removed", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const painter = {
    resize() {},
    overLimit: () => false,
    destroy() {},
    context: { gl: { getExtension: () => null } },
  };
  type Internals = { _setupPainter(this: { painter: unknown }): void };
  vi.spyOn(maplibregl.Map.prototype as unknown as Internals, "_setupPainter").mockImplementation(
    function (this: { painter: unknown }) {
      this.painter = painter;
    },
  );
  const map = new maplibregl.Map({ container: document.createElement("div") });
  expect(map._removed).toBeFalsy();
  map.remove();
  expect(map._removed).toBe(true);
});
