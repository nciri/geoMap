import { formatUtc, fromUtcInput, missionState, toUtcInput } from "./format";

it("shows UTC times in Zulu notation", () => {
  expect(formatUtc("2026-10-02T06:00:00Z")).toBe("2026-10-02 06:00Z");
  expect(formatUtc("2026-10-02T06:00:00.123456Z")).toBe("2026-10-02 06:00Z");
  expect(formatUtc(null)).toBe("—");
});

it("round-trips a datetime-local value as UTC", () => {
  expect(fromUtcInput("2026-10-02T06:00")).toBe("2026-10-02T06:00:00Z");
  expect(toUtcInput("2026-10-02T06:00:00Z")).toBe("2026-10-02T06:00");
  expect(fromUtcInput("")).toBeNull();
  expect(toUtcInput(null)).toBe("");
});

it("maps a mission status to its design system state", () => {
  expect(missionState("DRAFT")).toBe("blocked");
  expect(missionState("PUBLISHED")).toBe("ok");
  expect(missionState("WITHDRAWN")).toBe("revoked");
});
