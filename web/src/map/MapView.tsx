import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { FetchSource, PMTiles, Protocol } from "pmtiles";
import { tileHeaders } from "../auth/session";
import { errorMessage } from "../api/client";
import { absoluteTilesUrl, basemapStyle } from "./style";
import { CoordinateReadout } from "./CoordinateReadout";

export type LngLatBounds2 = [[number, number], [number, number]];

const protocol = new Protocol({ metadata: true });
maplibregl.addProtocol("pmtiles", protocol.tile);

interface Props {
  basemapId: string | null;
  initialBounds?: LngLatBounds2 | null;
  onReady?: (map: maplibregl.Map) => void;
}

export function MapView({ basemapId, initialBounds, onReady }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const initialBoundsRef = useRef(initialBounds);
  const [cursor, setCursor] = useState<{ lng: number; lat: number } | null>(null);
  const [basemapError, setBasemapError] = useState<string | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
    initialBoundsRef.current = initialBounds;
  });

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: basemapStyle(basemapId),
      center: [2.35, 46.6],
      zoom: 5,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("mousemove", (e) => setCursor({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    map.on("load", () => onReadyRef.current?.(map));
    const bounds = initialBoundsRef.current;
    if (bounds) map.fitBounds(bounds, { padding: 60, maxZoom: 15, animate: false });
    if (basemapId) {
      // The shared Headers object carries the current token; pmtiles reads it on every request.
      const tiles = new PMTiles(new FetchSource(absoluteTilesUrl(basemapId), tileHeaders));
      protocol.add(tiles);
      tiles.getHeader().then(
        (header) => {
          if (bounds) return;
          map.fitBounds(
            [
              [header.minLon, header.minLat],
              [header.maxLon, header.maxLat],
            ],
            { animate: false },
          );
        },
        (e: unknown) => setBasemapError(errorMessage(e)),
      );
    }
    return () => map.remove();
  }, [basemapId]);

  return (
    <div className="map-frame">
      <div ref={container} className="map" />
      {basemapError && (
        <p role="alert" className="map-alert">
          Fond de carte illisible : {basemapError}
        </p>
      )}
      <CoordinateReadout position={cursor} />
    </div>
  );
}
