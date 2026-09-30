import { useEffect, useRef, useState, type ReactNode } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { FetchSource, PMTiles, Protocol } from "pmtiles";
import { tileHeaders } from "../auth/session";
import { errorMessage } from "../api/client";
import type { LayerSpecification } from "maplibre-gl";
import { absoluteTilesUrl, basemapStyle, isOverlay, type StackLayer } from "./style";
import { visibility, type MapMode } from "./mapModes";
import { CoordinateReadout } from "./CoordinateReadout";

export type LngLatBounds2 = [[number, number], [number, number]];

// MapLibre otherwise looks for its worker next to its own module, a file the bundle never emits;
// bundling it keeps it same-origin, which the air-gapped deployment needs.
maplibregl.setWorkerUrl(workerUrl);

const protocol = new Protocol({ metadata: true });
maplibregl.addProtocol("pmtiles", protocol.tile);

interface Props {
  vector: StackLayer | null;
  imagery: StackLayer[];
  mode: MapMode;
  initialBounds?: LngLatBounds2 | null;
  onReady?: (map: maplibregl.Map) => void;
  children?: ReactNode;
}

export function MapView({ vector, imagery, mode, initialBounds, onReady, children }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const initialBoundsRef = useRef(initialBounds);
  const stackRef = useRef({ vector, imagery });
  const styleLayers = useRef<LayerSpecification[]>([]);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [cursor, setCursor] = useState<{ lng: number; lat: number } | null>(null);
  const [basemapError, setBasemapError] = useState<string | null>(null);
  const [imageryErrors, setImageryErrors] = useState<{ id: string; name: string; cause: string }[]>(
    [],
  );
  const stackKey = [vector?.id ?? "", ...imagery.map((i) => i.id)].join("|");

  useEffect(() => {
    onReadyRef.current = onReady;
    initialBoundsRef.current = initialBounds;
    stackRef.current = { vector, imagery };
  });

  useEffect(() => {
    let disposed = false;
    const { vector, imagery } = stackRef.current;
    const style = basemapStyle({ vector, imagery });
    styleLayers.current = style.layers;
    const created = new maplibregl.Map({
      container: container.current!,
      style,
      center: [2.35, 46.6],
      zoom: 5,
    });
    created.addControl(new maplibregl.NavigationControl(), "top-right");
    created.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    created.on("mousemove", (e) => setCursor({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    created.on("load", () => {
      if (disposed) return;
      onReadyRef.current?.(created);
      setMap(created);
    });
    const bounds = initialBoundsRef.current;
    if (bounds) created.fitBounds(bounds, { padding: 60, maxZoom: 15, animate: false });
    // The shared Headers object carries the current token; pmtiles reads it on every request.
    const open = (layer: StackLayer) => {
      const archive = new PMTiles(new FetchSource(absoluteTilesUrl(layer.id), tileHeaders));
      protocol.add(archive);
      return archive;
    };
    const archives: PMTiles[] = [];
    if (vector) {
      const archive = open(vector);
      archives.push(archive);
      archive.getHeader().then(
        (header) => {
          if (disposed || bounds) return;
          created.fitBounds(
            [
              [header.minLon, header.minLat],
              [header.maxLon, header.maxLat],
            ],
            { animate: false },
          );
        },
        (e: unknown) => {
          if (disposed) return;
          setBasemapError(errorMessage(e));
        },
      );
    }
    for (const layer of imagery) {
      const archive = open(layer);
      archives.push(archive);
      archive.getHeader().catch((e: unknown) => {
        if (disposed) return;
        setImageryErrors((errors) => [
          ...errors,
          { id: layer.id, name: layer.name, cause: errorMessage(e) },
        ]);
      });
    }
    return () => {
      disposed = true;
      setMap(null);
      created.remove();
      // pmtiles 4.5 has no removal method; its registry is a public Map keyed by source.
      for (const archive of archives) {
        const key = archive.source.getKey();
        if (protocol.tiles.get(key) === archive) protocol.tiles.delete(key);
      }
    };
  }, [stackKey]);

  useEffect(() => {
    if (!map) return;
    // Only the style's own layers: the mission and APP-6D layers stay visible in every view.
    for (const layer of styleLayers.current) {
      map.setLayoutProperty(layer.id, "visibility", visibility(layer.id, isOverlay(layer), mode));
    }
  }, [map, mode]);

  return (
    <div className="map-frame">
      <div ref={container} className="map" />
      <div className="map-alerts">
        {basemapError && (
          <p role="alert" title={basemapError}>
            Fond de carte illisible : le serveur ne l'a pas fourni.
          </p>
        )}
        {imageryErrors.map((error) => (
          <p key={error.id} role="alert" title={error.cause}>
            Imagerie illisible : {error.name}
          </p>
        ))}
      </div>
      {children}
      <CoordinateReadout position={cursor} />
    </div>
  );
}
