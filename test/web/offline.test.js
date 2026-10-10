import { describe, test, expect } from "vitest";
import { dayState, zurichIsoDate } from "../../src/web/static/offline.js";

describe("zurichIsoDate", () => {
  test("uses the Zurich day, not UTC's", () => {
    // 23:30 UTC on Saturday is already Sunday 01:30 in Zurich (CEST).
    expect(zurichIsoDate(new Date("2026-10-10T23:30:00Z"))).toBe("2026-10-11");
    expect(zurichIsoDate(new Date("2026-10-10T12:00:00Z"))).toBe("2026-10-10");
  });
});

describe("dayState", () => {
  test.each([
    ["2026-10-14", { isToday: false, isPast: true }],
    ["2026-10-15", { isToday: true, isPast: false }],
    ["2026-10-16", { isToday: false, isPast: false }],
  ])("%s on 2026-10-15", (date, expected) => {
    expect(dayState(date, "2026-10-15")).toEqual(expected);
  });
});
