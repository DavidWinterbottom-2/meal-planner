import { describe, test, expect } from "vitest";
import {
  buildHistoryView,
  buildWeekView,
  lunchLabel,
  sourceLabel,
  weekBadge,
  weekHeading,
} from "../../src/web/view.js";
import { openStore } from "../../src/store.js";
import { seedIfEmpty } from "../../src/seed/weeks.js";

function seeded() {
  const store = openStore();
  seedIfEmpty(store, "2026-10-01T00:00:00.000Z");
  return store;
}

describe("weekBadge", () => {
  test.each([
    ["2026-10-12", "2026-10-15", "This week"],
    ["2026-10-12", "2026-10-18", "This week"], // Sunday still belongs to the ending week
    ["2026-10-19", "2026-10-15", "Next week"],
    ["2026-10-05", "2026-10-15", "Last week"],
    ["2026-11-02", "2026-10-15", "In 3 weeks"],
    ["2026-09-28", "2026-10-15", "2 weeks ago"],
  ])("week %s seen on %s reads %s", (week, today, badge) => {
    expect(weekBadge(week, today)).toBe(badge);
  });
});

describe("weekHeading", () => {
  test("within one month", () => {
    expect(weekHeading("2026-10-12")).toBe("Mon 12 – Sun 18 Oct");
  });
  test("across a month end names both months", () => {
    expect(weekHeading("2026-09-28")).toBe("Mon 28 Sep – Sun 4 Oct");
  });
  test("across a year end", () => {
    expect(weekHeading("2027-12-27")).toBe("Mon 27 Dec – Sun 2 Jan");
  });
});

describe("labels", () => {
  test("Kita lunch reads as where Thomas is", () => {
    expect(lunchLabel("Kita")).toBe("Thomas at Kita");
    expect(lunchLabel(" Kita ")).toBe("Thomas at Kita");
    expect(lunchLabel("Kita pasta")).toBe("Kita pasta");
    expect(lunchLabel(null)).toBeNull();
  });
  test("source label", () => {
    expect(sourceLabel("Lisa")).toBe("Lisa's plan");
    expect(sourceLabel("David")).toBe("David's plan");
    expect(sourceLabel("Grandma")).toBe("Grandma's plan");
  });
});

describe("buildWeekView", () => {
  test("a seeded week: seven rows, dinner, Kita, today, source, prep", () => {
    const store = seeded();
    const view = buildWeekView(
      store.getWeek("2026-10-12"),
      "2026-10-12",
      "2026-10-15",
    );
    expect(view).toMatchObject({
      heading: "Mon 12 – Sun 18 Oct",
      badge: "This week",
      isCurrent: true,
      planned: true,
      source: "David's plan",
      prev: "2026-10-05",
      next: "2026-10-19",
    });
    expect(view.days).toHaveLength(7);
    expect(view.days.filter((d) => d.isToday).map((d) => d.date)).toEqual([
      "2026-10-15",
    ]);
    expect(view.days[0]).toMatchObject({
      label: "Mon 12 Oct",
      lunch: "Thomas at Kita",
      kita: true,
    });
    expect(view.days[3].snacks).toBe("Fruit · Cottage cheese + veggie sticks");
    expect(view.days[3].note).toBe("Cleaner 1:30–5pm");
  });

  test("today is highlighted only when it falls in the viewed week", () => {
    const store = seeded();
    const view = buildWeekView(
      store.getWeek("2026-10-05"),
      "2026-10-05",
      "2026-10-15",
    );
    expect(view.days.some((d) => d.isToday)).toBe(false);
    expect(view.badge).toBe("Last week");
  });

  test("an empty day in a planned week is still a row, marked empty", () => {
    const store = openStore();
    store.saveWeek(
      {
        week_start: "2026-10-19",
        source: "Lisa",
        days: [{ date: "2026-10-19", dinner: "Soup" }],
      },
      "t",
    );
    const view = buildWeekView(
      store.getWeek("2026-10-19"),
      "2026-10-19",
      "2026-10-15",
    );
    expect(view.source).toBe("Lisa's plan");
    expect(view.days[1]).toMatchObject({ date: "2026-10-20", empty: true });
    expect(view.days[0].empty).toBe(false);
  });

  test("an unplanned week has the heading, badge and navigation but no plan", () => {
    const view = buildWeekView(null, "2026-11-02", "2026-10-15");
    expect(view).toMatchObject({
      planned: false,
      source: null,
      badge: "In 3 weeks",
      prev: "2026-10-26",
      next: "2026-11-09",
    });
    expect(view.days).toHaveLength(7);
  });
});

describe("buildHistoryView", () => {
  test("keeps the store's newest-first order with headings and summaries", () => {
    const store = seeded();
    const entries = buildHistoryView(store.listWeeks());
    expect(entries.map((e) => e.weekStart)).toEqual([
      "2026-10-12",
      "2026-10-05",
    ]);
    expect(entries[0]).toMatchObject({
      heading: "Mon 12 – Sun 18 Oct",
      source: "David's plan",
    });
    expect(entries[0].dinners).toMatch(/^Mon Homestyle Fish Nuggets/);
  });
});
