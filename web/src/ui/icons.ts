// Line icons from the ALIAS design system: 20px grid, 1.5px stroke, drawn in currentColor.
export const ICONS = {
  overview:
    '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="4" rx="1"/><rect x="11" y="9" width="6" height="8" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/>',
  services:
    '<rect x="3" y="3.5" width="14" height="4" rx="1"/><rect x="3" y="12.5" width="14" height="4" rx="1"/><path d="M6 5.5h.01M6 14.5h.01M9 5.5h5M9 14.5h5"/>',
  catalog:
    '<path d="M10 2.8 16.5 6.4v7.2L10 17.2 3.5 13.6V6.4z"/><path d="M3.5 6.4 10 10l6.5-3.6M10 10v7.2"/>',
  updates:
    '<path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16 3.5v3h-3"/><path d="M10 7v3.5l2 1.5"/>',
  logs: '<path d="M5 3h7l3 3v11H5z"/><path d="M12 3v3h3M8 9.5h4M8 12.5h4M8 15h2"/>',
  alert: '<path d="M10 3.2 17.3 16H2.7z"/><path d="M10 8v3.6M10 13.8h.01"/>',
  sync: '<path d="M4 7.5h11l-3-3M16 12.5H5l3 3"/>',
  access:
    '<circle cx="8" cy="7" r="3"/><path d="M3 16.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"/><path d="M14 8.5h3.5M15.75 6.75v3.5"/>',
  security:
    '<path d="M10 2.8 16 5v4.6c0 3.7-2.6 6.3-6 7.6-3.4-1.3-6-3.9-6-7.6V5z"/><path d="m7.5 10 1.8 1.8L12.8 8.3"/>',
  settings:
    '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
  missions:
    '<path d="M3 5.5 7.5 3.5l5 2 4.5-2v11l-4.5 2-5-2L3 16.5z"/><path d="M7.5 3.5v11M12.5 5.5v11"/>',
  terminals: '<rect x="5.5" y="2.5" width="9" height="15" rx="1.5"/><path d="M9 15h2"/>',
  basemaps:
    '<path d="M10 3 17 6.8 10 10.6 3 6.8z"/><path d="M3 10.3 10 14l7-3.7"/><path d="M3 13.6 10 17.3l7-3.7" stroke-dasharray="1.6 1.6"/>',
  map: '<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2 2 2.8 4.4 2.8 7s-.8 5-2.8 7c-2-2-2.8-4.4-2.8-7S8 5 10 3z"/>',
  layers: '<path d="M10 3 17 7l-7 4-7-4z"/><path d="M3 10.5l7 4 7-4"/>',
  play: '<path d="M6.5 4.5v11l9-5.5z"/>',
  stop: '<rect x="5" y="5" width="10" height="10" rx="1"/>',
  pause: '<path d="M7 5v10M13 5v10"/>',
  restart: '<path d="M4 10a6 6 0 1 0 1.8-4.3"/><path d="M4 3.5v3h3"/>',
  rollback: '<path d="M8 5 4 9l4 4"/><path d="M4 9h8a4 4 0 0 1 0 8h-2"/>',
  download: '<path d="M10 3v9.5M6 9l4 4 4-4M4 16.5h12"/>',
  "transfer-paused": '<path d="M10 3v6M6 6.5 10 10l4-3.5"/><path d="M8 13v4M12 13v4"/>',
  install:
    '<rect x="3" y="11" width="14" height="6" rx="1"/><path d="M10 3v6.5M7 7l3 3 3-3M6 14h.01"/>',
  revoke: '<circle cx="10" cy="10" r="7"/><path d="m5 15 10-10"/>',
  lock: '<rect x="4.5" y="9" width="11" height="8" rx="1.2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
  unlock:
    '<rect x="4.5" y="9" width="11" height="8" rx="1.2"/><path d="M7 9V6.5a3 3 0 0 1 5.8-1"/>',
  exemption:
    '<path d="M5 3h7l3 3v11H5z"/><path d="M12 3v3h3"/><path d="m8 12.5 1.5 1.5 3-3"/><path d="M8 9h4"/>',
  signature:
    '<path d="M10 2.8 12 4.4l2.5-.2.6 2.4 2.1 1.4-1 2.3 1 2.3-2.1 1.4-.6 2.4-2.5-.2L10 17.2 8 15.6l-2.5.2-.6-2.4-2.1-1.4 1-2.3-1-2.3 2.1-1.4.6-2.4 2.5.2z"/><path d="m7.6 10 1.6 1.6 3.2-3.2"/>',
  node: '<rect x="3" y="3" width="14" height="5.5" rx="1"/><rect x="3" y="11.5" width="14" height="5.5" rx="1"/><path d="M6 5.75h.01M6 14.25h.01"/>',
  cpu: '<rect x="5" y="5" width="10" height="10" rx="1"/><rect x="8" y="8" width="4" height="4"/><path d="M8 2.5V5M12 2.5V5M8 15v2.5M12 15v2.5M2.5 8H5M2.5 12H5M15 8h2.5M15 12h2.5"/>',
  storage:
    '<ellipse cx="10" cy="5" rx="6" ry="2.2"/><path d="M4 5v10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V5M4 10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/>',
  queue: '<path d="M3 5h14M3 10h14M3 15h8"/><path d="M14 13v4M16 15h-4" />',
  "link-up":
    '<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1"/>',
  "link-isolated":
    '<path d="M12.3 7.7 15.3 4.7M4.7 15.3l3-3"/><path d="M11 5.5l1-1a3 3 0 0 1 4.2 4.2l-1 1M9 14.5l-1 1a3 3 0 0 1-4.2-4.2l1-1"/><path d="M3 3l14 14"/>',
  antenna:
    '<path d="M10 10v7.5M7 17.5h6"/><circle cx="10" cy="8" r="1.5"/><path d="M6.5 11.5a5 5 0 0 1 0-7M13.5 4.5a5 5 0 0 1 0 7"/>',
  check: '<path d="m4.5 10.5 3.5 3.5 7.5-8"/>',
  close: '<path d="m5 5 10 10M15 5 5 15"/>',
  info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6.3h.01"/>',
  unknown:
    '<circle cx="10" cy="10" r="7" stroke-dasharray="2.2 2"/><path d="M8 8a2 2 0 1 1 2.7 1.9c-.5.2-.7.6-.7 1.1v.5M10 13.8h.01"/>',
  degraded: '<path d="M10 3.5 17 16H3z"/><path d="M10 8.5v3.2M10 13.6h.01"/>',
  error: '<rect x="3.5" y="3.5" width="13" height="13" rx="2"/><path d="M10 7v4M10 13.3h.01"/>',
  pending:
    '<circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 1.5"/>',
  search: '<circle cx="8.8" cy="8.8" r="5.3"/><path d="m12.8 12.8 4 4"/>',
  filter: '<path d="M3 4.5h14l-5.5 6.5v5l-3 1.5v-6.5z"/>',
  bell: '<path d="M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13z"/><path d="M8.3 17a1.8 1.8 0 0 0 3.4 0"/>',
  user: '<circle cx="10" cy="7" r="3.2"/><path d="M4 17c.7-3 3-4.6 6-4.6s5.3 1.6 6 4.6"/>',
  menu: '<path d="M3 5.5h14M3 10h14M3 14.5h14"/>',
  collapse:
    '<rect x="3" y="3.5" width="14" height="13" rx="1.5"/><path d="M8 3.5v13M13.5 8 11.5 10l2 2"/>',
  "chevron-right": '<path d="m8 5 5 5-5 5"/>',
  "chevron-down": '<path d="m5 8 5 5 5-5"/>',
  external: '<path d="M11 3.5h5.5V9M16.5 3.5 9.5 10.5"/><path d="M15 12v4.5H3.5V5H8"/>',
  more: '<path d="M5 10h.01M10 10h.01M15 10h.01" stroke-width="2.4"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  minus: '<path d="M4 10h12"/>',
  eye: '<path d="M2.5 10S5.2 4.8 10 4.8 17.5 10 17.5 10 14.8 15.2 10 15.2 2.5 10 2.5 10z"/><circle cx="10" cy="10" r="2.3"/>',
  locate:
    '<circle cx="10" cy="10" r="5"/><circle cx="10" cy="10" r="1.2" fill="currentColor"/><path d="M10 2.5V5M10 15v2.5M2.5 10H5M15 10h2.5"/>',
  crosshair: '<path d="M10 3v5M10 12v5M3 10h5M12 10h5"/>',
  "draw-point":
    '<path d="M10 17s5-4.6 5-8.6a5 5 0 0 0-10 0c0 4 5 8.6 5 8.6z"/><circle cx="10" cy="8.4" r="1.8"/>',
  "draw-line":
    '<path d="M4 15.5 9 8l3 4 4-7"/><circle cx="4" cy="15.5" r="1.3"/><circle cx="16" cy="5" r="1.3"/>',
  "draw-polygon":
    '<path d="M5 5.5 14.5 4 16.5 12 9 16.5 3.5 12z"/><circle cx="5" cy="5.5" r="1.1" fill="currentColor"/><circle cx="14.5" cy="4" r="1.1" fill="currentColor"/><circle cx="16.5" cy="12" r="1.1" fill="currentColor"/><circle cx="9" cy="16.5" r="1.1" fill="currentColor"/><circle cx="3.5" cy="12" r="1.1" fill="currentColor"/>',
  publish: '<path d="M3.5 10.5 16.5 3.5 13 16.5 9.5 11.5z"/><path d="m9.5 11.5 7-8"/>',
  symbol:
    '<rect x="3.5" y="5.5" width="13" height="9" rx="0.5"/><path d="m3.5 5.5 13 9M16.5 5.5l-13 9"/>',
  measure: '<path d="m3 14 11-11 3 3-11 11z"/><path d="m6 11 1.5 1.5M8.5 8.5 10 10M11 6l1.5 1.5"/>',
} as const;

// geoMap additions drawn on the same grid, to report back to the design system.
export const GEOMAP_ICONS = {
  sun: '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
  moon: '<path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z"/>',
  display: '<rect x="2.5" y="3.5" width="15" height="10" rx="1"/><path d="M7 16.5h6M10 13.5v3"/>',
  logout: '<path d="M8 3.5H4.5v13H8"/><path d="M12 6.5 15.5 10 12 13.5M15.5 10H8"/>',
  trash:
    '<path d="M3.5 5.5h13M8 5.5v-2h4v2"/><path d="m5 5.5.8 11h8.4l.8-11"/><path d="M8.5 8.5v5M11.5 8.5v5"/>',
  "chevron-up": '<path d="m5 12 5-5 5 5"/>',
} as const;

export const ALL_ICONS = { ...ICONS, ...GEOMAP_ICONS };
export type IconName = keyof typeof ALL_ICONS;

// The ALIAS mark (redrawn from the brand board, pending validation against the official artwork).
export const LOGO_PATHS = {
  A: "M20.4 68.6 L45.4 24.6 Q48.8 19.2 52.2 24.6 L79.8 79 L68.4 79 L48.8 43.6 L30.8 71.4 Q26.6 76.2 20.4 68.6 Z",
  SWOOSH:
    "M16.2 79.8 C24.2 84.8 50.4 77.2 72.7 37.7 L71.5 36.7 C50.4 72.4 27.6 80.2 20.9 74.1 Q18.4 76.4 16.2 79.8 Z",
};
