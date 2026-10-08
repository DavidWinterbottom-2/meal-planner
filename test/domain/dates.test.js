import { describe, test, expect } from "vitest";
import {
  isIsoDate,
  isMonday,
  weekOf,
  nearestMonday,
  weekDates,
  zurichToday,
  resolveWeek,
  assertMonday,
  addDays,
} from "../../src/domain/dates.js";

describe("isIsoDate", () => {
  test("accepts real dates and rejects malformed or impossible ones", () => {
    expect(isIsoDate("2026-10-12")).toBe(true);
    expect(isIsoDate("12/10/2026")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate(20261012)).toBe(false);
  });
});

describe("week arithmetic", () => {
  test("isMonday", () => {
    expect(isMonday("2026-10-12")).toBe(true);
    expect(isMonday("2026-10-13")).toBe(false);
    expect(isMonday("not-a-date")).toBe(false);
  });

  test("weekOf maps every day to its Monday, Sunday included", () => {
    expect(weekOf("2026-10-12")).toBe("2026-10-12");
    expect(weekOf("2026-10-15")).toBe("2026-10-12");
    expect(weekOf("2026-10-18")).toBe("2026-10-12");
  });

  test("nearestMonday goes back for Tue–Thu and forward for Fri–Sun", () => {
    expect(nearestMonday("2026-10-13")).toBe("2026-10-12");
    expect(nearestMonday("2026-10-15")).toBe("2026-10-12");
    expect(nearestMonday("2026-10-16")).toBe("2026-10-19");
    expect(nearestMonday("2026-10-18")).toBe("2026-10-19");
  });

  test("weekDates spans Monday to Sunday, across a month boundary", () => {
    expect(weekDates("2026-09-28")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  test("addDays is not shifted by the October DST change", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });
});

describe("zurichToday and resolveWeek", () => {
  test("Sunday 20:00 in Zurich is still the ending week", () => {
    const now = new Date("2026-10-18T18:00:00Z"); // 20:00 CEST
    expect(zurichToday(now)).toBe("2026-10-18");
    expect(resolveWeek("current", now)).toBe("2026-10-12");
  });

  test("23:30Z on Sunday is already Monday in Zurich", () => {
    const now = new Date("2026-10-18T23:30:00Z"); // 01:30 Monday CEST
    expect(resolveWeek("current", now)).toBe("2026-10-19");
  });

  test("next and previous are one week either side", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    expect(resolveWeek("next", now)).toBe("2026-10-19");
    expect(resolveWeek("previous", now)).toBe("2026-10-05");
  });

  test("an explicit Monday passes through; anything else throws", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    expect(resolveWeek("2026-10-05", now)).toBe("2026-10-05");
    expect(() => resolveWeek("2026-10-06", now)).toThrow(
      /Did you mean 2026-10-05/,
    );
    expect(() => resolveWeek("soon", now)).toThrow(/YYYY-MM-DD/);
  });
});

describe("assertMonday", () => {
  test("names the weekday and the nearest Monday", () => {
    expect(() => assertMonday("2026-10-13")).toThrow(
      "week_start 2026-10-13 is a Tuesday, not a Monday. Did you mean 2026-10-12?",
    );
  });

  test("rejects a malformed date with a format error", () => {
    expect(() => assertMonday("12/10/2026")).toThrow(/YYYY-MM-DD format/);
  });
});
