// The MCP tool surface Claude uses to plan meals. Each tool returns a short
// human-readable summary followed by the JSON payload.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  weekOf,
  zurichToday,
  resolveWeek,
  weekdayName,
} from "./domain/dates.js";
import { RULE_SECTIONS } from "./flatnotes.js";

const DATE = z.string().max(10).describe("A date in YYYY-MM-DD format");
const MONDAY = z
  .string()
  .describe("The Monday that starts the week, YYYY-MM-DD");

// Generous limits on free text: a toddler's lunch never needs 500 characters.
const TEXT_MAX = 500;
const LONG_TEXT_MAX = 5000;

const dayFields = {
  morning_snack: z.string().max(TEXT_MAX).nullish().describe("Morning snack"),
  lunch: z
    .string()
    .max(TEXT_MAX)
    .nullish()
    .describe(
      'Lunch. Mon–Wed is usually the literal "Kita" (Thomas eats there).',
    ),
  afternoon_snack: z
    .string()
    .max(TEXT_MAX)
    .nullish()
    .describe("Afternoon snack"),
  dinner: z
    .string()
    .max(TEXT_MAX)
    .nullish()
    .describe("Dinner, the main meal of the day"),
  note: z
    .string()
    .max(TEXT_MAX)
    .nullish()
    .describe("Short note for the day, e.g. who is out, appointments"),
};

const PLANNING_CONTEXT_DESCRIPTION = [
  "ALWAYS call this first whenever planning meals (e.g. 'plan the next 2 weeks'), before drafting anything.",
  "Returns, in one bundle: the household rules, meal bank, recipes and pantry (markdown, from Flatnotes);",
  "the most recent stored weeks up to and including this week (weeks_back of them, default 6), in full, so new plans build on what we ate recently;",
  "any weeks already planned after this week; weeks that are only an image (status image_only) and need",
  "transcribing; and the next Monday with no plan yet.",
  "Then check the Cozi calendar for the planning window, draft the plan in chat, iterate with David,",
  "and only call save_week_plan once he agrees. If rules_status says rules are unavailable, read the",
  "notes with the Flatnotes connector instead.",
].join(" ");

const ok = (summary, data) => ({
  content: [
    { type: "text", text: `${summary}\n\n${JSON.stringify(data, null, 2)}` },
  ],
});
const fail = (message) => ({
  content: [{ type: "text", text: `Error: ${message}` }],
  isError: true,
});

// Run a tool body, turning thrown validation/not-found errors into tool errors.
const guarded = (fn) => async (args) => {
  try {
    return await fn(args);
  } catch (e) {
    return fail(e.message);
  }
};

// "Mon 12 Oct" style label for a date.
function dayLabel(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${weekdayName(date).slice(0, 3)} ${d.getUTCDate()} ${month}`;
}

// A readable rendering of a week for Claude, one line per day.
export function formatWeekText(week) {
  const header = `Week of ${dayLabel(week.week_start)} — ${week.source}'s plan (${week.status})`;
  const lines = week.days.map((d) => {
    const parts = [
      d.morning_snack && `morning: ${d.morning_snack}`,
      d.lunch && `lunch: ${d.lunch}`,
      d.afternoon_snack && `afternoon: ${d.afternoon_snack}`,
      d.dinner && `dinner: ${d.dinner}`,
      d.note && `note: ${d.note}`,
    ].filter(Boolean);
    return `- ${dayLabel(d.date)}: ${parts.length ? parts.join("; ") : "—"}`;
  });
  const extra = [
    week.prep && `Prep:\n${week.prep}`,
    week.notes && `Notes:\n${week.notes}`,
  ].filter(Boolean);
  return [header, ...lines, ...extra].join("\n");
}

// Build the get_planning_context bundle. Pure apart from the injected store and rules.
export async function buildPlanningContext({
  store,
  loadRules,
  today,
  weeksBack,
}) {
  const currentMonday = weekOf(today);
  const weeks = store.listWeeks();
  const recent = weeks
    .filter((w) => w.week_start <= currentMonday)
    .slice(0, weeksBack)
    .map((w) => store.getWeek(w.week_start));
  const upcoming = weeks
    .filter((w) => w.week_start > currentMonday)
    .reverse()
    .map((w) => store.getWeek(w.week_start));
  const rules = await loadRules();
  const rulesStatus = rules.error
    ? `Rules unavailable (${rules.error}). Read the notes with the Flatnotes connector instead.`
    : rules.missing.length
      ? `Missing rule notes: ${rules.missing.join(", ")}. The other sections are included.`
      : "All rule sections loaded.";
  return {
    today,
    current_week: currentMonday,
    next_unplanned_monday: store.nextUnplannedMonday(currentMonday),
    rules_status: rulesStatus,
    rules: rules.sections,
    image_only_weeks: weeks
      .filter((w) => w.status === "image_only")
      .map((w) => w.week_start),
    recent_weeks: recent,
    upcoming_weeks: upcoming,
  };
}

// `now` is injected so tests can fix "today"; `loadRules` comes from the Flatnotes client.
export function createMcpServer({ store, loadRules, now = () => new Date() }) {
  const server = new McpServer({ name: "meal-planner", version: "1.0.0" });
  const stamp = () => now().toISOString();

  server.registerTool(
    "get_planning_context",
    {
      title: "Get planning context",
      description: PLANNING_CONTEXT_DESCRIPTION,
      inputSchema: {
        weeks_back: z
          .number()
          .int()
          .min(1)
          .max(26)
          .nullish()
          .describe(
            "How many stored weeks up to and including this week to return in full (default 6)",
          ),
      },
    },
    guarded(async ({ weeks_back }) => {
      const ctx = await buildPlanningContext({
        store,
        loadRules,
        today: zurichToday(now()),
        weeksBack: weeks_back ?? 6,
      });
      const summary = [
        `Today is ${ctx.today}. Next unplanned Monday: ${ctx.next_unplanned_monday}.`,
        ctx.rules_status,
        `${ctx.recent_weeks.length} recent week(s), ${ctx.upcoming_weeks.length} already planned ahead.`,
        ctx.image_only_weeks.length
          ? `Image-only weeks needing transcription: ${ctx.image_only_weeks.join(", ")}.`
          : "No image-only weeks.",
      ].join("\n");
      return ok(summary, ctx);
    }),
  );

  server.registerTool(
    "save_week_plan",
    {
      title: "Save a week's plan",
      description:
        "Create or replace the plan for one Monday–Sunday week (replaces every day of that week; the old version " +
        "is kept and can be restored with undo_last_change). A 2-week plan is 2 calls. Only save once David has " +
        'agreed the plan in chat. Use source "Lisa" when transcribing Lisa\'s plan.',
      inputSchema: {
        week_start: MONDAY,
        source: z
          .string()
          .max(100)
          .nullish()
          .describe('Who made the plan: "David", "Lisa", or free text'),
        days: z
          .array(z.object({ date: DATE, ...dayFields }))
          .max(7)
          .describe(
            "The days of the week that have content; omitted days are left empty",
          ),
        prep: z
          .string()
          .max(LONG_TEXT_MAX)
          .nullish()
          .describe("Prep / batch-cook tasks for the week (markdown)"),
        notes: z
          .string()
          .max(LONG_TEXT_MAX)
          .nullish()
          .describe("Any other notes for the week (markdown)"),
      },
    },
    guarded(async (args) => {
      const week = store.saveWeek(args, stamp());
      return ok(`Saved.\n${formatWeekText(week)}`, week);
    }),
  );

  server.registerTool(
    "update_day",
    {
      title: "Update one day",
      description:
        "Change some fields of a single day in an already-planned week, leaving everything else as it is. " +
        "Pass an empty string to clear a field; fields that are omitted or null are left unchanged.",
      inputSchema: {
        date: DATE,
        fields: z.object(dayFields).describe("Only the fields to change"),
      },
    },
    guarded(async ({ date, fields }) => {
      const day = store.updateDay(date, fields, stamp());
      return ok(`Updated ${dayLabel(date)}.`, day);
    }),
  );

  server.registerTool(
    "get_week_plan",
    {
      title: "Get a week's plan",
      description:
        'Read one week: a YYYY-MM-DD Monday, or "current", "next" or "previous" (relative to today in ' +
        "Europe/Zurich; weeks run Monday–Sunday). Returns all seven days.",
      inputSchema: {
        week: z
          .string()
          .max(10)
          .nullish()
          .describe('A Monday (YYYY-MM-DD) or "current" / "next" / "previous"'),
      },
    },
    guarded(async ({ week }) => {
      const weekStart = resolveWeek(week ?? "current", now());
      const found = store.getWeek(weekStart);
      if (!found) {
        return ok(`There is no plan for the week of ${dayLabel(weekStart)}.`, {
          week_start: weekStart,
          planned: false,
        });
      }
      return ok(formatWeekText(found), found);
    }),
  );

  server.registerTool(
    "list_weeks",
    {
      title: "List weeks",
      description:
        "List planned weeks, newest first, with source, status and a one-line dinner summary. " +
        "from/to are compared with each week's Monday (week_start), inclusive.",
      inputSchema: {
        from: DATE.nullish().describe(
          "Earliest week_start to include (YYYY-MM-DD)",
        ),
        to: DATE.nullish().describe(
          "Latest week_start to include (YYYY-MM-DD)",
        ),
      },
    },
    guarded(async ({ from, to }) => {
      const weeks = store.listWeeks({
        from: from ?? undefined,
        to: to ?? undefined,
      });
      const lines = weeks.map(
        (w) =>
          `- ${w.week_start} (${w.source}, ${w.status}): ${w.dinner_summary}`,
      );
      return ok(
        weeks.length ? lines.join("\n") : "No weeks planned in that range.",
        weeks,
      );
    }),
  );

  server.registerTool(
    "delete_week",
    {
      title: "Delete a week",
      description:
        "Delete a week's plan entirely. It can be restored with undo_last_change.",
      inputSchema: { week_start: MONDAY },
    },
    guarded(async ({ week_start }) => {
      store.deleteWeek(week_start, stamp());
      return ok(`Deleted the week of ${dayLabel(week_start)}.`, {
        week_start,
        deleted: true,
      });
    }),
  );

  server.registerTool(
    "undo_last_change",
    {
      title: "Undo the last change",
      description:
        "Reverse the most recent save, day update or delete. Call again to step further back; an undo is never " +
        "itself undone.",
      inputSchema: {},
    },
    guarded(async () => {
      const result = store.undoLastChange(stamp());
      if (!result) return ok("Nothing to undo.", { undone: false });
      const outcome = result.week
        ? `restored it to its previous version`
        : `removed it (it did not exist before that change)`;
      return ok(
        `Undid the ${result.undid} of the week of ${dayLabel(result.week_start)}: ${outcome}.`,
        result,
      );
    }),
  );

  return server;
}

export { RULE_SECTIONS };
