import { toPoint } from "mgrs";
import { formatLatLon, formatMgrs } from "./coordinates";

it("formats latitude and longitude with hemispheres and 5 decimals", () => {
  expect(formatLatLon(2.29448, 48.85837)).toBe("48.85837° N 2.29448° E");
  expect(formatLatLon(-58.38159, -34.60372)).toBe("34.60372° S 58.38159° W");
});

it("formats MGRS at 1 m precision with grouped digits", () => {
  const text = formatMgrs(2.29448, 48.85837);
  expect(text).toMatch(/^31U [A-Z]{2} \d{5} \d{5}$/);
  const [lng, lat] = toPoint(text.replace(/ /g, ""));
  expect(Math.abs(lng - 2.29448)).toBeLessThan(0.00003);
  expect(Math.abs(lat - 48.85837)).toBeLessThan(0.00003);
});

it("says so when a position has no MGRS reference", () => {
  expect(formatMgrs(10, 85)).toBe("hors zone MGRS");
});
