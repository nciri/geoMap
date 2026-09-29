import { formatLatLon, formatMgrs } from "./coordinates";

export function CoordinateReadout({ position }: { position: { lng: number; lat: number } | null }) {
  if (!position) return <div className="coordinates">Survolez la carte</div>;
  return (
    <div className="coordinates">
      <span>{formatMgrs(position.lng, position.lat)}</span>
      <span>{formatLatLon(position.lng, position.lat)}</span>
    </div>
  );
}
