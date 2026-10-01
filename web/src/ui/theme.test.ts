import { act, renderHook } from "@testing-library/react";

let dark = false;
const listeners = new Set<() => void>();

// The store keeps the preference in module state: each test starts from a fresh copy.
async function load() {
  vi.resetModules();
  return import("./theme");
}

beforeEach(() => {
  dark = false;
  listeners.clear();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === "(prefers-color-scheme: dark)" && dark;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => vi.restoreAllMocks());

it("follows the system until a theme is forced", async () => {
  dark = true;
  const { useTheme } = await load();
  const { result } = renderHook(() => useTheme());
  expect(result.current).toMatchObject({ preference: "system", resolved: "dark" });
  act(() => result.current.setPreference("light"));
  expect(result.current.resolved).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem("geomap.theme")).toBe("light");
  act(() => result.current.setPreference("system"));
  expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  expect(localStorage.getItem("geomap.theme")).toBeNull();
});

it("tracks a change of the system setting while on system", async () => {
  const { useTheme } = await load();
  const { result } = renderHook(() => useTheme());
  expect(result.current.resolved).toBe("light");
  act(() => {
    dark = true;
    listeners.forEach((l) => l());
  });
  expect(result.current.resolved).toBe("dark");
});

it("treats an unknown stored value as system", async () => {
  localStorage.setItem("geomap.theme", "blue");
  const { readPreference } = await load();
  expect(readPreference()).toBe("system");
});

it("works without storage or matchMedia", async () => {
  for (const method of ["getItem", "setItem", "removeItem"] as const) {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new Error("blocked");
    });
  }
  // @ts-expect-error simulating an engine without matchMedia
  delete window.matchMedia;
  const { useTheme } = await load();
  const { result } = renderHook(() => useTheme());
  expect(result.current).toMatchObject({ preference: "system", resolved: "light" });
  act(() => result.current.setPreference("dark"));
  expect(result.current.resolved).toBe("dark");
});
