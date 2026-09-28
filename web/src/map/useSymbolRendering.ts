import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { fetchSymbolIcon, renderGraphic, type Feature } from "../api/geomap";
import { errorMessage } from "../api/client";
import {
  bandOf,
  FALLBACK_SOURCE,
  liveIconError,
  anchoredCanvasLayout,
  pointFallbacks,
  pointSymbols,
  symbolKey,
  symbolLabel,
  SYMBOL_SOURCE,
  TACTICAL_SOURCE,
  tacticalCollection,
  ZOOM_FOR_BAND,
  type Band,
} from "./symbolLayer";

const isGraphic = (f: Feature) =>
  f.kind === "APP6" && !!f.sidc && f.geometry.type !== "Point" && f.suggestionStatus !== "REJECTED";

export function useSymbolRendering(
  map: maplibregl.Map | null,
  features: Feature[] | undefined,
  hiddenId: string | null,
): { error: string | null } {
  const [band, setBand] = useState<Band>("MID");
  const [iconErrors, setIconErrors] = useState(new Map<string, string>());
  const [icons, setIcons] = useState(new Set<string>());
  // Per map: a download started for a map removed by a basemap switch must not stop the new
  // map from loading the same icon.
  const loading = useRef(new WeakMap<maplibregl.Map, Set<string>>());

  useEffect(() => {
    if (!map) return;
    const update = () => setBand(bandOf(map.getZoom()));
    update();
    map.on("zoomend", update);
    return () => void map.off("zoomend", update);
  }, [map]);

  useEffect(() => {
    if (!map || map._removed || !features) return;
    let pending = loading.current.get(map);
    if (!pending) loading.current.set(map, (pending = new Set()));
    const inFlight = pending;
    for (const f of features) {
      if (f.kind !== "APP6" || !f.sidc || f.geometry.type !== "Point") continue;
      const key = symbolKey(f.sidc, f.modifiers);
      if (map.hasImage(key) || inFlight.has(key)) continue;
      inFlight.add(key);
      fetchSymbolIcon(f.sidc, f.modifiers ?? {})
        .then(async ({ blob, anchorX, anchorY }) => {
          const bitmap = await createImageBitmap(blob);
          if (map._removed) return;
          if (!map.hasImage(key)) map.addImage(key, anchoredImage(bitmap, anchorX, anchorY));
          setIcons((current) => new Set(current).add(key));
          setIconErrors((current) => {
            if (!current.has(key)) return current;
            const next = new Map(current);
            next.delete(key);
            return next;
          });
        })
        .catch((e: unknown) =>
          setIconErrors((current) =>
            new Map(current).set(
              key,
              `Symbole illisible (${symbolLabel(f) || f.sidc}) : ${errorMessage(e)}`,
            ),
          ),
        )
        .finally(() => inFlight.delete(key));
    }
  }, [map, features]);

  const graphics = (features ?? []).filter(isGraphic);
  const renders = useQueries({
    queries: graphics.map((f) => ({
      queryKey: ["graphic", f.id, f.updatedAt, band],
      queryFn: () => renderGraphic(f.sidc!, f.geometry, f.modifiers ?? {}, ZOOM_FOR_BAND[band]),
      staleTime: Infinity,
    })),
  });

  const rendered = renders.map((r) => r.data);
  useEffect(() => {
    if (!map || map._removed || !features) return;
    // Loaded keys outlive a remounted map; only icons this map holds count.
    const loaded = new Set([...icons].filter((key) => map.hasImage(key)));
    map.getSource<GeoJSONSource>(SYMBOL_SOURCE)?.setData(pointSymbols(features, loaded, hiddenId));
    map
      .getSource<GeoJSONSource>(FALLBACK_SOURCE)
      ?.setData(pointFallbacks(features, loaded, hiddenId));
    const done = graphics.flatMap((f, i) => {
      const collection = rendered[i];
      return collection && f.id !== hiddenId ? [{ featureId: f.id, collection }] : [];
    });
    map.getSource<GeoJSONSource>(TACTICAL_SOURCE)?.setData(tacticalCollection(done));
  });

  const graphicError = renders.find((r) => r.error)?.error;
  const iconError = liveIconError(iconErrors, features ?? []);
  return {
    error:
      iconError ?? (graphicError ? `Graphisme illisible : ${errorMessage(graphicError)}` : null),
  };
}

function anchoredImage(
  bitmap: ImageBitmap,
  anchorX: number | null,
  anchorY: number | null,
): ImageData {
  const layout = anchoredCanvasLayout(anchorX, anchorY, bitmap.width, bitmap.height);
  const context = new OffscreenCanvas(layout.width, layout.height).getContext("2d")!;
  context.drawImage(bitmap, layout.dx, layout.dy);
  return context.getImageData(0, 0, layout.width, layout.height);
}
