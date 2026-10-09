import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createMcpServer,
  formatWeekText,
  buildPlanningContext,
} from "../src/mcp.js";
import { openStore } from "../src/store.js";
import { seedIfEmpty } from "../src/seed/weeks.js";

const NOW = new Date("2026-10-15T10:00:00Z"); // Thursday of the 2026-10-12 week
const allRules = async () => ({
  sections: { household: "H", meal_bank: "M", recipes: "R", pantry: "P" },
  missing: [],
  error: null,
});

let store, client;

async function connect(loadRules = allRules) {
  const server = createMcpServer({ store, loadRules, now: () => NOW });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "0" });
  await client.connect(b);
}

// Call a tool; returns { text, data, isError } with the JSON payload parsed.
async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content[0].text;
  const json = text.match(/\n\n([[{][\s\S]*)$/)?.[1];
  return {
    text,
    data: json ? JSON.parse(json) : null,
    isError: Boolean(res.isError),
  };
}

beforeEach(async () => {
  store = openStore();
  seedIfEmpty(store, "2026-10-01T00:00:00.000Z");
  await connect();
});
afterEach(async () => {
  await client.close();
  store.close();
});

describe("server info", () => {
  test("reports the package.json version", async () => {
    const { readFileSync } = await import("node:fs");
    const { version } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(client.getServerVersion()).toMatchObject({
      name: "meal-planner",
      version,
    });
  });
});

describe("tool list", () => {
  test("exposes exactly the planned tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "delete_week",
      "get_planning_context",
      "get_week_plan",
      "list_weeks",
      "save_week_plan",
      "undo_last_change",
      "update_day",
    ]);
  });

  test("get_planning_context tells Claude to call it first", async () => {
    const { tools } = await client.listTools();
    const desc = tools.find(
      (t) => t.name === "get_planning_context",
    ).description;
    expect(desc).toMatch(/call this first whenever planning meals/i);
  });
});

describe("get_planning_context", () => {
  test("bundles rules, recent and upcoming weeks, and the next unplanned Monday", async () => {
    const { data, text } = await call("get_planning_context");
    expect(data.rules).toEqual({
      household: "H",
      meal_bank: "M",
      recipes: "R",
      pantry: "P",
    });
    expect(data.rules_status).toBe("All rule sections loaded.");
    expect(data.current_week).toBe("2026-10-12");
    expect(data.recent_weeks.map((w) => w.week_start)).toEqual([
      "2026-10-12",
      "2026-10-05",
    ]);
    expect(data.recent_weeks[0].days).toHaveLength(7);
    expect(data.upcoming_weeks).toEqual([]);
    expect(data.next_unplanned_monday).toBe("2026-10-19");
    expect(data.image_only_weeks).toEqual([]);
    expect(text).toMatch(/Next unplanned Monday: 2026-10-19/);
  });

  test("weeks_back limits the recent weeks", async () => {
    const { data } = await call("get_planning_context", { weeks_back: 1 });
    expect(data.recent_weeks.map((w) => w.week_start)).toEqual(["2026-10-12"]);
  });

  test("still succeeds when Flatnotes is down, and says so", async () => {
    await client.close();
    await connect(async () => ({
      sections: {
        household: null,
        meal_bank: null,
        recipes: null,
        pantry: null,
      },
      missing: ["household", "meal_bank", "recipes", "pantry"],
      error: "Flatnotes unreachable: fetch failed",
    }));
    const { data, isError } = await call("get_planning_context");
    expect(isError).toBe(false);
    expect(data.rules_status).toMatch(
      /Rules unavailable .* Flatnotes connector/,
    );
    expect(data.next_unplanned_monday).toBe("2026-10-19");
  });

  test("names a single missing rule note", async () => {
    await client.close();
    await connect(async () => ({
      sections: { household: "H", meal_bank: "M", recipes: null, pantry: "P" },
      missing: ["recipes"],
      error: null,
    }));
    const { data } = await call("get_planning_context");
    expect(data.rules_status).toBe(
      "Missing rule notes: recipes. The other sections are included.",
    );
  });

  test("lists already-planned future weeks oldest first", async () => {
    const days = [];
    store.saveWeek({ week_start: "2026-10-26", source: "David", days }, "t");
    store.saveWeek({ week_start: "2026-10-19", source: "Lisa", days }, "t");
    const ctx = await buildPlanningContext({
      store,
      loadRules: allRules,
      today: "2026-10-15",
      weeksBack: 6,
    });
    expect(ctx.upcoming_weeks.map((w) => w.week_start)).toEqual([
      "2026-10-19",
      "2026-10-26",
    ]);
    expect(ctx.next_unplanned_monday).toBe("2026-11-02");
  });
});

describe("save_week_plan", () => {
  test("saves and returns the week", async () => {
    const { data, text, isError } = await call("save_week_plan", {
      week_start: "2026-10-19",
      source: "Lisa",
      days: [{ date: "2026-10-19", lunch: "Kita", dinner: "Tomato pasta" }],
      prep: "Make sauce",
    });
    expect(isError).toBe(false);
    expect(data).toMatchObject({
      week_start: "2026-10-19",
      source: "Lisa",
      status: "data",
      prep: "Make sauce",
    });
    expect(text).toMatch(/Saved\.\nWeek of Mon 19 Oct — Lisa's plan/);
  });

  test("returns a tool error naming the nearest Monday", async () => {
    const res = await call("save_week_plan", {
      week_start: "2026-10-20",
      source: "David",
      days: [],
    });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(
      /Tuesday, not a Monday\. Did you mean 2026-10-19\?/,
    );
  });
});

describe("update_day", () => {
  test("changes a single field", async () => {
    const { data } = await call("update_day", {
      date: "2026-10-15",
      fields: { dinner: "Homemade pizza" },
    });
    expect(data).toMatchObject({
      date: "2026-10-15",
      dinner: "Homemade pizza",
      note: "Cleaner 1:30–5pm",
    });
  });

  test("errors for an unplanned week", async () => {
    const res = await call("update_day", {
      date: "2026-11-03",
      fields: { dinner: "x" },
    });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/has no plan/);
  });
});

describe("get_week_plan", () => {
  test('"current" resolves to this week with all 7 days', async () => {
    const { data, text } = await call("get_week_plan", { week: "current" });
    expect(data.week_start).toBe("2026-10-12");
    expect(data.days).toHaveLength(7);
    expect(text).toMatch(
      /- Thu 15 Oct: morning: Fruit; .*dinner: Mild prawn ramen\/noodles; note: Cleaner/,
    );
  });

  test("defaults to the current week", async () => {
    expect((await call("get_week_plan")).data.week_start).toBe("2026-10-12");
  });

  test('"previous" and an explicit Monday', async () => {
    expect(
      (await call("get_week_plan", { week: "previous" })).data.week_start,
    ).toBe("2026-10-05");
    expect(
      (await call("get_week_plan", { week: "2026-10-05" })).data.days[5].dinner,
    ).toMatch(/Älplermagronen/);
  });

  test("an unplanned week is a clear result, not an error", async () => {
    const res = await call("get_week_plan", { week: "next" });
    expect(res.isError).toBe(false);
    expect(res.text).toMatch(/There is no plan for the week of Mon 19 Oct/);
    expect(res.data).toEqual({ week_start: "2026-10-19", planned: false });
  });

  test("a non-Monday is a tool error", async () => {
    expect((await call("get_week_plan", { week: "2026-10-14" })).isError).toBe(
      true,
    );
  });
});

describe("list_weeks, delete_week, undo_last_change", () => {
  test("list_weeks gives one line per week", async () => {
    const { text, data } = await call("list_weeks");
    expect(data).toHaveLength(2);
    expect(text).toMatch(
      /^- 2026-10-12 \(David, data\): Mon Homestyle Fish Nuggets/,
    );
    expect((await call("list_weeks", { from: "2030-01-01" })).text).toMatch(
      /^No weeks planned/,
    );
  });

  test("delete then undo brings the week back", async () => {
    expect(
      (await call("delete_week", { week_start: "2026-10-05" })).data,
    ).toEqual({
      week_start: "2026-10-05",
      deleted: true,
    });
    const undo = await call("undo_last_change");
    expect(undo.text).toMatch(
      /Undid the delete of the week of Mon 5 Oct: restored it/,
    );
    expect(store.getWeek("2026-10-05")).not.toBeNull();
  });

  test("undo after a replacement names the week and the outcome", async () => {
    await call("save_week_plan", {
      week_start: "2026-10-12",
      source: "David",
      days: [],
    });
    const undo = await call("undo_last_change");
    expect(undo.text).toMatch(
      /Undid the replace of the week of Mon 12 Oct: restored it to its previous version/,
    );
  });

  test("undoing a create says the week was removed", async () => {
    await call("save_week_plan", {
      week_start: "2026-10-19",
      source: "David",
      days: [],
    });
    expect((await call("undo_last_change")).text).toMatch(/removed it/);
  });

  test("reports nothing to undo", async () => {
    await call("undo_last_change"); // seed week 2026-10-12
    await call("undo_last_change"); // seed week 2026-10-05
    expect((await call("undo_last_change")).text).toMatch(/^Nothing to undo\./);
  });

  test("delete of a missing week is a tool error", async () => {
    expect(
      (await call("delete_week", { week_start: "2026-11-02" })).isError,
    ).toBe(true);
  });
});

describe("formatWeekText", () => {
  test("includes prep and notes, and a dash for empty days", () => {
    const text = formatWeekText({
      week_start: "2026-10-19",
      source: "David",
      status: "data",
      prep: "Batch sauce",
      notes: "Visitors Sat",
      days: [
        {
          date: "2026-10-19",
          morning_snack: null,
          lunch: null,
          afternoon_snack: null,
          dinner: null,
          note: null,
        },
      ],
    });
    expect(text).toBe(
      "Week of Mon 19 Oct — David's plan (data)\n- Mon 19 Oct: —\nPrep:\nBatch sauce\nNotes:\nVisitors Sat",
    );
  });
});

describe("review follow-ups", () => {
  test("image_only weeks are flagged in the bundle and its summary", async () => {
    store._db
      .prepare(
        "UPDATE week SET status = 'image_only' WHERE week_start = '2026-10-05'",
      )
      .run();
    const { data, text } = await call("get_planning_context");
    expect(data.image_only_weeks).toEqual(["2026-10-05"]);
    expect(text).toMatch(
      /Image-only weeks needing transcription: 2026-10-05\./,
    );
  });

  test("weeks_back defaults to 6 and is bounded to 1–26", async () => {
    for (let i = 1; i <= 8; i++) {
      const monday = new Date(Date.UTC(2026, 8, 28 - 7 * i))
        .toISOString()
        .slice(0, 10);
      store.saveWeek({ week_start: monday, source: "David", days: [] }, "t");
    }
    expect((await call("get_planning_context")).data.recent_weeks).toHaveLength(
      6,
    );
    expect(
      (await call("get_planning_context", { weeks_back: 0 })).isError,
    ).toBe(true);
    expect(
      (await call("get_planning_context", { weeks_back: 27 })).isError,
    ).toBe(true);
  });

  test("tools resolve 'current' in Zurich time, not UTC", async () => {
    await client.close();
    const server = createMcpServer({
      store,
      loadRules: allRules,
      now: () => new Date("2026-10-18T23:30:00Z"), // already Monday 19 Oct in Zurich
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    client = new Client({ name: "test", version: "0" });
    await client.connect(b);
    expect(
      (await call("get_week_plan", { week: "current" })).data.week_start,
    ).toBe("2026-10-19");
    expect((await call("get_planning_context")).data.current_week).toBe(
      "2026-10-19",
    );
  });

  test("explicit nulls fall back to defaults instead of erroring", async () => {
    expect((await call("get_week_plan", { week: null })).data.week_start).toBe(
      "2026-10-12",
    );
    expect(
      (await call("list_weeks", { from: null, to: null })).data,
    ).toHaveLength(2);
    expect(
      (await call("get_planning_context", { weeks_back: null })).isError,
    ).toBe(false);
    const saved = await call("save_week_plan", {
      week_start: "2026-10-19",
      source: null,
      days: [],
      prep: null,
    });
    expect(saved.data.source).toBe("David");
  });

  test("update_day with null fields leaves them unchanged", async () => {
    const { data } = await call("update_day", {
      date: "2026-10-15",
      fields: { dinner: "Pizza", note: null },
    });
    expect(data).toMatchObject({ dinner: "Pizza", note: "Cleaner 1:30–5pm" });
  });

  test("over-long text and more than 7 days are rejected", async () => {
    const long = await call("update_day", {
      date: "2026-10-15",
      fields: { dinner: "x".repeat(501) },
    });
    expect(long.isError).toBe(true);
    const days = Array.from({ length: 8 }, () => ({ date: "2026-10-19" }));
    expect(
      (await call("save_week_plan", { week_start: "2026-10-19", days }))
        .isError,
    ).toBe(true);
  });
});
