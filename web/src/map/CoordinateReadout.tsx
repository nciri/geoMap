import { MapPanel } from "../ui/components";
import { formatLatLon, formatMgrs } from "./coordinates";

export function CoordinateReadout({ position }: { position: { lng: number; lat: number } | null }) {
  return (
    <MapPanel className="map-coords">
      <div className="al-coords">
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
