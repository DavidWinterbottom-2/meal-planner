import { describe, test, expect } from "vitest";
import {
  validatePlan,
  dinnerSummary,
  cleanDayFields,
  cleanText,
} from "../../src/domain/plan.js";
import { pickUndoTarget } from "../../src/domain/history.js";

describe("validatePlan", () => {
  test("accepts a partial week and returns days sorted and cleaned", () => {
    const days = validatePlan("2026-10-12", [
      { date: "2026-10-14", dinner: " Meatballs ", lunch: "Kita" },
      { date: "2026-10-12", dinner: "Fish nuggets", note: "" },
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-10-12", "2026-10-14"]);
    expect(days[1]).toMatchObject({ dinner: "Meatballs", lunch: "Kita" });
    expect(days[0].note).toBeNull();
  });

  test("rejects a non-Monday week_start, naming the nearest Monday", () => {
    expect(() => validatePlan("2026-10-13", [])).toThrow(
      /Did you mean 2026-10-12/,
    );
  });

  test("rejects a malformed week_start", () => {
    expect(() => validatePlan("12/10/2026", [])).toThrow(/YYYY-MM-DD format/);
  });

  test("rejects a day outside the week, naming its real week", () => {
    expect(() =>
      validatePlan("2026-10-12", [{ date: "2026-10-19", dinner: "x" }]),
    ).toThrow(
      "day 2026-10-19 is outside the week of 2026-10-12 (2026-10-12 to 2026-10-18); it belongs to the week of 2026-10-19",
    );
  });

  test("rejects a duplicate date", () => {
    expect(() =>
      validatePlan("2026-10-12", [
        { date: "2026-10-12" },
        { date: "2026-10-12" },
      ]),
    ).toThrow(/more than once/);
  });

  test("rejects a malformed day date and a non-list", () => {
    expect(() => validatePlan("2026-10-12", [{ date: "Monday" }])).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() => validatePlan("2026-10-12", [null])).toThrow(/YYYY-MM-DD/);
    expect(() => validatePlan("2026-10-12", "Mon: pasta")).toThrow(
      /must be a list/,
    );
  });

  test("never fills in Kita or any other field", () => {
    const [mon] = validatePlan("2026-10-12", [
      { date: "2026-10-12", dinner: "Pasta" },
    ]);
    expect(mon).toEqual({ date: "2026-10-12", dinner: "Pasta" });
  });
});

describe("cleaning", () => {
  test("cleanText trims and turns blanks into null", () => {
    expect(cleanText("  x ")).toBe("x");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(undefined)).toBeNull();
    expect(cleanText(null)).toBeNull();
  });

  test("cleanDayFields keeps only known fields that were given", () => {
    expect(cleanDayFields({ dinner: "Pizza", colour: "red" })).toEqual({
      dinner: "Pizza",
    });
  });
});

describe("dinnerSummary", () => {
  const days = [
    { date: "2026-10-14", dinner: "Meatballs" },
    { date: "2026-10-12", dinner: "Fish nuggets" },
    { date: "2026-10-13", dinner: null },
  ];

  test("lists dinners in day order, skipping empty days", () => {
    expect(dinnerSummary(days)).toBe("Mon Fish nuggets · Wed Meatballs");
  });

  test("truncates to the maximum length with an ellipsis", () => {
    const out = dinnerSummary(days, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
  });

  test("says so when there are no dinners", () => {
    expect(dinnerSummary([{ date: "2026-10-12" }])).toBe("(no dinners)");
  });
});

describe("pickUndoTarget", () => {
  test("picks the newest change", () => {
    const rows = [
      { id: 1, kind: "create" },
      { id: 2, kind: "replace" },
    ];
    expect(pickUndoTarget(rows).id).toBe(2);
  });

  test("two undos step back twice and never undo an undo", () => {
    const rows = [
      { id: 1, kind: "create" }, // A
      { id: 2, kind: "update_day" }, // B
      { id: 3, kind: "undo", undoes_id: 2 },
    ];
    expect(pickUndoTarget(rows).id).toBe(1);
  });

  test("a change after an undo is undone first", () => {
    const rows = [
      { id: 1, kind: "create" },
      { id: 2, kind: "undo", undoes_id: 1 },
      { id: 3, kind: "create" },
    ];
    expect(pickUndoTarget(rows).id).toBe(3);
  });

  test("returns null when there is nothing left to undo", () => {
    expect(pickUndoTarget([])).toBeNull();
    expect(
      pickUndoTarget([
        { id: 1, kind: "create" },
        { id: 2, kind: "undo", undoes_id: 1 },
      ]),
    ).toBeNull();
  });
});
