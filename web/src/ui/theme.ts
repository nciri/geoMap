import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

const KEY = "geomap.theme";
const QUERY = "(prefers-color-scheme: dark)";
const subscribers = new Set<() => void>();

export function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "dark" || stored === "light" ? stored : "system";
  } catch {
    return "system";
  }
}

// Also kept in memory: with storage blocked, a forced theme still holds until the tab closes.
let preference: ThemePreference = readPreference();

const media = () => (typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null);

function snapshot(): string {
  const resolved = preference === "system" ? (media()?.matches ? "dark" : "light") : preference;
  return `${preference}|${resolved}`;
}

function subscribe(onChange: () => void) {
  subscribers.add(onChange);
  const query = media();
  query?.addEventListener("change", onChange);
  return () => {
    subscribers.delete(onChange);
    query?.removeEventListener("change", onChange);
  };
}

function setPreference(next: ThemePreference) {
  preference = next;
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Not remembered across reloads, nothing else to do.
  }
  if (next === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = next;
  subscribers.forEach((notify) => notify());
}

export function useTheme() {
  const [current, resolved] = useSyncExternalStore(subscribe, snapshot).split("|") as [
    ThemePreference,
    ResolvedTheme,
  ];
  return { preference: current, resolved, setPreference };
}
