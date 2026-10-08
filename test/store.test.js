import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, NotFoundError } from "../src/store.js";
import { seedIfEmpty, SEED_WEEKS } from "../src/seed/weeks.js";

const T1 = "2026-10-08T10:00:00.000Z";
const T2 = "2026-10-08T11:00:00.000Z";
const T3 = "2026-10-08T12:00:00.000Z";

const plan = (overrides = {}) => ({
  week_start: "2026-10-12",
  source: "David",
  days: [
    { date: "2026-10-12", lunch: "Kita", dinner: "Fish nuggets" },
    { date: "2026-10-15", dinner: "Prawn ramen", note: "Cleaner 1:30–5pm" },
  ],
  prep: "Batch the pasta sauce",
  ...overrides,
});

let store;
beforeEach(() => {
  store = openStore();
});
afterEach(() => store.close());

const history = () =>
  store.db.prepare("SELECT * FROM history ORDER BY id").all();

describe("schema", () => {
  test("creates the tables and sets the schema version", () => {
    const cols = (t) =>
      store.db
        .prepare(`PRAGMA table_info(${t})`)
        .all()
        .map((c) => c.name);
    expect(cols("week")).toEqual([
      "week_start",
      "source",
      "status",
      "prep",
      "notes",
      "updated_at",
    ]);
    expect(cols("day")).toContain("afternoon_snack");
    expect(cols("history")).toContain("undoes_id");
    expect(store.db.pragma("user_version", { simple: true })).toBe(1);
  });

  test("reopening an existing file keeps its data", () => {
    const dir = mkdtempSync(join(tmpdir(), "meals-"));
    try {
      const path = join(dir, "meals.db");
      const a = openStore(path);
      a.saveWeek(plan(), T1);
      a.close();
      const b = openStore(path);
      expect(b.getWeek("2026-10-12").days[0].dinner).toBe("Fish nuggets");
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("refuses a database from a newer schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "meals-"));
    try {
      const path = join(dir, "meals.db");
      const a = openStore(path);
      a.db.pragma("user_version = 99");
      a.close();
      expect(() => openStore(path)).toThrow(/newer than this app/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("saveWeek", () => {
  test("creates a week with status data and pads to seven days", () => {
    const week = store.saveWeek(plan({ source: "Lisa" }), T1);
    expect(week).toMatchObject({
      week_start: "2026-10-12",
      source: "Lisa",
      status: "data",
      updated_at: T1,
    });
    expect(week.days).toHaveLength(7);
    expect(week.days[1]).toEqual({
      date: "2026-10-13",
      morning_snack: null,
      lunch: null,
      afternoon_snack: null,
      dinner: null,
      note: null,
    });
  });

  test("replacing a week stores only the new days and keeps the old version in history", () => {
    store.saveWeek(plan(), T1);
    store.saveWeek(
      plan({ days: [{ date: "2026-10-13", dinner: "Pizza" }] }),
      T2,
    );
    const week = store.getWeek("2026-10-12");
    expect(week.days.filter((d) => d.dinner).map((d) => d.dinner)).toEqual([
      "Pizza",
    ]);
    const [create, replace] = history();
    expect(create.kind).toBe("create");
    expect(create.before_json).toBeNull();
    expect(JSON.parse(create.after_json).days).toHaveLength(2);
    expect(replace.kind).toBe("replace");
    expect(JSON.parse(replace.before_json).days[0].dinner).toBe("Fish nuggets");
  });

  test("an invalid plan writes nothing", () => {
    store.saveWeek(plan(), T1);
    expect(() =>
      store.saveWeek(plan({ days: [{ date: "2026-10-19", dinner: "x" }] }), T2),
    ).toThrow(/outside the week/);
    expect(store.getWeek("2026-10-12").days[0].dinner).toBe("Fish nuggets");
    expect(history()).toHaveLength(1);
  });

  test("defaults a blank source to David", () => {
    expect(store.saveWeek(plan({ source: " " }), T1).source).toBe("David");
  });
});

describe("updateDay", () => {
  test("changes only the given field and advances updated_at", () => {
    store.saveWeek(plan(), T1);
    const day = store.updateDay("2026-10-15", { dinner: "Homemade pizza" }, T2);
    expect(day).toMatchObject({
      date: "2026-10-15",
      dinner: "Homemade pizza",
      note: "Cleaner 1:30–5pm",
    });
    const week = store.getWeek("2026-10-12");
    expect(week.updated_at).toBe(T2);
    expect(week.days[0].dinner).toBe("Fish nuggets");
    expect(history().at(-1).kind).toBe("update_day");
  });

  test("can fill a day that had no row yet, and clear a field", () => {
    store.saveWeek(plan(), T1);
    expect(store.updateDay("2026-10-17", { lunch: "Rösti" }, T2).lunch).toBe(
      "Rösti",
    );
    expect(store.updateDay("2026-10-15", { note: "" }, T3).note).toBeNull();
  });

  test("fails without writing when the week has no plan", () => {
    expect(() => store.updateDay("2026-10-20", { dinner: "x" }, T1)).toThrow(
      NotFoundError,
    );
    expect(history()).toHaveLength(0);
  });

  test("rejects a bad date or no known fields", () => {
    store.saveWeek(plan(), T1);
    expect(() => store.updateDay("15/10/2026", { dinner: "x" }, T2)).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() => store.updateDay("2026-10-15", { pudding: "x" }, T2)).toThrow(
      /no fields to update/,
    );
  });
});

describe("reading", () => {
  test("getWeek returns null for an unplanned week and rejects non-Mondays", () => {
    expect(store.getWeek("2026-10-19")).toBeNull();
    expect(() => store.getWeek("2026-10-20")).toThrow(/not a Monday/);
  });

  test("listWeeks is newest first with a dinner summary, and filters by range", () => {
    store.saveWeek(
      plan({
        week_start: "2026-10-05",
        days: [{ date: "2026-10-05", dinner: "Pasta" }],
      }),
      T1,
    );
    store.saveWeek(plan(), T1);
    const all = store.listWeeks();
    expect(all.map((w) => w.week_start)).toEqual(["2026-10-12", "2026-10-05"]);
    expect(all[0]).toEqual({
      week_start: "2026-10-12",
      source: "David",
      status: "data",
      dinner_summary: "Mon Fish nuggets · Thu Prawn ramen",
    });
    expect(
      store.listWeeks({ from: "2026-10-06" }).map((w) => w.week_start),
    ).toEqual(["2026-10-12"]);
    expect(
      store.listWeeks({ to: "2026-10-05" }).map((w) => w.week_start),
    ).toEqual(["2026-10-05"]);
    expect(() => store.listWeeks({ from: "last week" })).toThrow(/YYYY-MM-DD/);
  });

  test("nextUnplannedMonday skips planned weeks", () => {
    store.saveWeek(plan({ week_start: "2026-10-05", days: [] }), T1);
    store.saveWeek(plan(), T1);
    expect(store.nextUnplannedMonday("2026-10-05")).toBe("2026-10-19");
    expect(store.nextUnplannedMonday("2026-10-26")).toBe("2026-10-26");
  });
});

describe("deleteWeek", () => {
  test("removes the week and records its last version", () => {
    store.saveWeek(plan(), T1);
    store.deleteWeek("2026-10-12", T2);
    expect(store.getWeek("2026-10-12")).toBeNull();
    expect(store.listWeeks()).toEqual([]);
    const del = history().at(-1);
    expect(del.kind).toBe("delete");
    expect(JSON.parse(del.before_json).week_start).toBe("2026-10-12");
  });

  test("errors for a missing week", () => {
    expect(() => store.deleteWeek("2026-10-12", T1)).toThrow(NotFoundError);
  });
});

describe("undoLastChange", () => {
  test("undoing an overwrite restores the week exactly", () => {
    const original = store.saveWeek(plan(), T1);
    store.saveWeek(plan({ days: [], source: "Lisa" }), T2);
    const result = store.undoLastChange(T3);
    expect(result).toMatchObject({
      week_start: "2026-10-12",
      undid: "replace",
    });
    expect(store.getWeek("2026-10-12")).toEqual(original);
  });

  test("undoing a create removes the week", () => {
    store.saveWeek(plan({ week_start: "2026-10-19", days: [] }), T1);
    expect(store.undoLastChange(T2)).toMatchObject({
      undid: "create",
      week: null,
    });
    expect(store.getWeek("2026-10-19")).toBeNull();
  });

  test("undoing a delete brings the week back", () => {
    const original = store.saveWeek(plan(), T1);
    store.deleteWeek("2026-10-12", T2);
    store.undoLastChange(T3);
    expect(store.getWeek("2026-10-12")).toEqual(original);
  });

  test("two undos reverse two different changes", () => {
    store.saveWeek(plan(), T1); // A
    store.updateDay("2026-10-15", { dinner: "Pizza" }, T2); // B
    expect(store.undoLastChange(T3).undid).toBe("update_day");
    expect(store.getWeek("2026-10-12").days[3].dinner).toBe("Prawn ramen");
    expect(store.undoLastChange(T3).undid).toBe("create");
    expect(store.getWeek("2026-10-12")).toBeNull();
    const undos = history().filter((h) => h.kind === "undo");
    expect(undos.map((u) => u.undoes_id)).toEqual([2, 1]);
  });

  test("reports nothing to undo and writes nothing", () => {
    expect(store.undoLastChange(T1)).toBeNull();
    store.saveWeek(plan(), T1);
    store.undoLastChange(T2);
    const before = history().length;
    expect(store.undoLastChange(T3)).toBeNull();
    expect(history()).toHaveLength(before);
  });

  test("history rows are never modified", () => {
    store.saveWeek(plan(), T1);
    const first = history()[0];
    store.saveWeek(plan({ days: [] }), T2);
    store.undoLastChange(T3);
    expect(history()[0]).toEqual(first);
  });
});

describe("seedIfEmpty", () => {
  test("seeds both brief weeks once and never again", () => {
    expect(seedIfEmpty(store, T1)).toBe(2);
    expect(seedIfEmpty(store, T2)).toBe(0);
    expect(store.listWeeks().map((w) => w.week_start)).toEqual([
      "2026-10-12",
      "2026-10-05",
    ]);
    const oct5 = store.getWeek("2026-10-05");
    expect(oct5.days[0].lunch).toBe("Kita");
    expect(oct5.days[5].dinner).toBe("Älplermagronen with mince & apple sauce");
    expect(oct5.prep).toMatch(/museum trip/);
    expect(history().every((h) => h.kind === "create")).toBe(true);
  });

  test("every seed week passes plan validation as written", () => {
    for (const week of SEED_WEEKS)
      expect(() => store.saveWeek(week, T1)).not.toThrow();
  });
});

describe("review follow-ups", () => {
  test("seeding is blocked by any existing week, not just the seed weeks", () => {
    store.saveWeek(plan({ week_start: "2026-11-02", days: [] }), T1);
    expect(seedIfEmpty(store, T2)).toBe(0);
    expect(store.listWeeks().map((w) => w.week_start)).toEqual(["2026-11-02"]);
  });

  test("deleting every week never brings the seed examples back", () => {
    seedIfEmpty(store, T1);
    store.deleteWeek("2026-10-05", T2);
    store.deleteWeek("2026-10-12", T2);
    expect(seedIfEmpty(store, T3)).toBe(0);
    expect(store.listWeeks()).toEqual([]);
  });

  test("seeded state survives reopening the database file", () => {
    const dir = mkdtempSync(join(tmpdir(), "meals-"));
    try {
      const path = join(dir, "meals.db");
      const a = openStore(path);
      seedIfEmpty(a, T1);
      a.close();
      const b = openStore(path);
      expect(seedIfEmpty(b, T2)).toBe(0);
      expect(b.listWeeks()).toHaveLength(2);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the database itself refuses to modify or delete history rows", () => {
    store.saveWeek(plan(), T1);
    expect(() =>
      store.db.prepare("UPDATE history SET kind = 'create'").run(),
    ).toThrow(/append-only/);
    expect(() => store.db.prepare("DELETE FROM history").run()).toThrow(
      /append-only/,
    );
  });

  test("every earlier history row is unchanged after later writes and undos", () => {
    store.saveWeek(plan(), T1);
    store.updateDay("2026-10-15", { dinner: "Pizza" }, T2);
    const prefix = history();
    store.saveWeek(plan({ days: [] }), T3);
    store.deleteWeek("2026-10-12", T3);
    store.undoLastChange(T3);
    store.undoLastChange(T3);
    expect(history().slice(0, prefix.length)).toEqual(prefix);
  });

  test("a change made after an undo is the next thing undone", () => {
    store.saveWeek(plan(), T1); // A
    store.undoLastChange(T2); // undo A
    store.saveWeek(plan({ week_start: "2026-10-19", days: [] }), T3); // B
    expect(store.undoLastChange(T3)).toMatchObject({
      week_start: "2026-10-19",
      undid: "create",
    });
    expect(store.getWeek("2026-10-12")).toBeNull();
    expect(store.undoLastChange(T3)).toBeNull();
  });

  test("update_day treats null as not given and only an empty string clears", () => {
    store.saveWeek(plan(), T1);
    const day = store.updateDay(
      "2026-10-15",
      { lunch: "Rösti", dinner: null, note: undefined },
      T2,
    );
    expect(day).toMatchObject({
      lunch: "Rösti",
      dinner: "Prawn ramen",
      note: "Cleaner 1:30–5pm",
    });
    expect(() => store.updateDay("2026-10-15", { dinner: null }, T2)).toThrow(
      /no fields to update/,
    );
  });

  test("listWeeks bounds are inclusive at both ends", () => {
    store.saveWeek(plan({ week_start: "2026-10-05", days: [] }), T1);
    store.saveWeek(plan(), T1);
    expect(
      store
        .listWeeks({ from: "2026-10-12", to: "2026-10-12" })
        .map((w) => w.week_start),
    ).toEqual(["2026-10-12"]);
    expect(store.listWeeks({ from: "2026-10-05" })).toHaveLength(2);
  });
});
