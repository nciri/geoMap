import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { fetchSymbolIcon, renderGraphic, type Feature } from "../api/geomap";
import { errorMessage } from "../api/client";
import {
  bandOf,
  iconOffset,
  pointSymbols,
  symbolKey,
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
  const [iconError, setIconError] = useState<string | null>(null);
  const [offsets, setOffsets] = useState(new Map<string, [number, number]>());
  const loading = useRef(new Set<string>());

  useEffect(() => {
    if (!map) return;
    const update = () => setBand(bandOf(map.getZoom()));
    update();
    map.on("zoomend", update);
    return () => void map.off("zoomend", update);
  }, [map]);

  useEffect(() => {
    if (!map || !features) return;
    for (const f of features) {
      if (f.kind !== "APP6" || !f.sidc || f.geometry.type !== "Point") continue;
      const key = symbolKey(f.sidc, f.modifiers);
      if (map.hasImage(key) || loading.current.has(key)) continue;
      loading.current.add(key);
      fetchSymbolIcon(f.sidc, f.modifiers ?? {})
        .then(async ({ blob, anchorX, anchorY }) => {
          const bitmap = await createImageBitmap(blob);
          if (map._removed) return;
          if (!map.hasImage(key)) map.addImage(key, bitmap);
          setOffsets((current) =>
            new Map(current).set(key, iconOffset(anchorX, anchorY, bitmap.width, bitmap.height)),
          );
        })
        .catch((e: unknown) => setIconError(`Symbole illisible : ${errorMessage(e)}`))
        .finally(() => loading.current.delete(key));
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
    map.getSource<GeoJSONSource>(SYMBOL_SOURCE)?.setData(pointSymbols(features, offsets, hiddenId));
    const done = graphics.flatMap((f, i) => {
      const collection = rendered[i];
      return collection && f.id !== hiddenId ? [{ featureId: f.id, collection }] : [];
    });
    map.getSource<GeoJSONSource>(TACTICAL_SOURCE)?.setData(tacticalCollection(done));
  });

  const graphicError = renders.find((r) => r.error)?.error;
  return {
    error:
      iconError ?? (graphicError ? `Graphisme illisible : ${errorMessage(graphicError)}` : null),
  };
}
