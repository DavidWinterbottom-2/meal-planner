// SQLite storage for weekly plans. This is the only write path: every write
// runs in one transaction together with its history row, so history and
// undo can't be bypassed.

import Database from "better-sqlite3";
import {
  addDays,
  assertMonday,
  isIsoDate,
  weekDates,
  weekOf,
} from "./domain/dates.js";
import {
  DAY_FIELDS,
  cleanDayFields,
  dinnerSummary,
  validatePlan,
  cleanText,
} from "./domain/plan.js";
import { pickUndoTarget } from "./domain/history.js";

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE week (
  week_start TEXT PRIMARY KEY,
  source     TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('data', 'image_only')),
  prep       TEXT,
  notes      TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE day (
  week_start      TEXT NOT NULL REFERENCES week(week_start) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  morning_snack   TEXT,
  lunch           TEXT,
  afternoon_snack TEXT,
  dinner          TEXT,
  note            TEXT,
  PRIMARY KEY (week_start, date)
);
CREATE TABLE history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start  TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('create', 'replace', 'update_day', 'delete', 'undo')),
  before_json TEXT,
  after_json  TEXT,
  undoes_id   INTEGER REFERENCES history(id),
  at          TEXT NOT NULL
);
`;

export class NotFoundError extends Error {}

export function openStore(path = ":memory:") {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  const q = {
    week: db.prepare("SELECT * FROM week WHERE week_start = ?"),
    days: db.prepare("SELECT * FROM day WHERE week_start = ? ORDER BY date"),
    insertWeek: db.prepare(
      `INSERT INTO week (week_start, source, status, prep, notes, updated_at)
       VALUES (@week_start, @source, @status, @prep, @notes, @updated_at)`,
    ),
    insertDay: db.prepare(
      `INSERT INTO day (week_start, date, ${DAY_FIELDS.join(", ")})
       VALUES (@week_start, @date, ${DAY_FIELDS.map((f) => "@" + f).join(", ")})`,
    ),
    deleteWeek: db.prepare("DELETE FROM week WHERE week_start = ?"),
    touchWeek: db.prepare(
      "UPDATE week SET updated_at = ? WHERE week_start = ?",
    ),
    insertHistory: db.prepare(
      `INSERT INTO history (week_start, kind, before_json, after_json, undoes_id, at)
       VALUES (@week_start, @kind, @before_json, @after_json, @undoes_id, @at)`,
    ),
    historyRows: db.prepare(
      "SELECT id, week_start, kind, before_json, undoes_id FROM history",
    ),
    weekCount: db.prepare("SELECT count(*) AS n FROM week"),
    weekStarts: db.prepare("SELECT week_start FROM week"),
  };

  // The stored week with its stored days only (no padding), or null.
  function snapshot(weekStart) {
    const week = q.week.get(weekStart);
    if (!week) return null;
    const days = q.days.all(weekStart).map(({ week_start, ...day }) => day);
    return { ...week, days };
  }

  // Replace whatever is stored for the snapshot's week with the snapshot.
  function writeSnapshot(weekStart, snap) {
    q.deleteWeek.run(weekStart);
    if (!snap) return;
    const { days, ...week } = snap;
    q.insertWeek.run(week);
    for (const day of days) {
      q.insertDay.run({ ...emptyDay(day.date), ...day, week_start: weekStart });
    }
  }

  function record(weekStart, kind, before, after, at, undoesId = null) {
    q.insertHistory.run({
      week_start: weekStart,
      kind,
      before_json: before ? JSON.stringify(before) : null,
      after_json: after ? JSON.stringify(after) : null,
      undoes_id: undoesId,
      at,
    });
  }

  const saveWeekTx = db.transaction(
    ({ week_start, source, days, prep, notes }, at) => {
      const cleanDays = validatePlan(week_start, days);
      const before = snapshot(week_start);
      writeSnapshot(week_start, {
        week_start,
        source: cleanText(source) ?? "David",
        status: "data",
        prep: cleanText(prep),
        notes: cleanText(notes),
        updated_at: at,
        days: cleanDays,
      });
      const after = snapshot(week_start);
      record(week_start, before ? "replace" : "create", before, after, at);
      return after;
    },
  );

  const updateDayTx = db.transaction((date, fields, at) => {
    if (!isIsoDate(date))
      throw new Error(`date "${date}" must be a date in YYYY-MM-DD format`);
    const weekStart = weekOf(date);
    const before = snapshot(weekStart);
    if (!before)
      throw new NotFoundError(
        `the week of ${weekStart} has no plan; save it with save_week_plan first`,
      );
    const changes = cleanDayFields(fields);
    if (Object.keys(changes).length === 0) {
      throw new Error(
        `no fields to update; use any of ${DAY_FIELDS.join(", ")}`,
      );
    }
    const existing = before.days.find((d) => d.date === date) ?? emptyDay(date);
    const days = before.days
      .filter((d) => d.date !== date)
      .concat({ ...existing, ...changes });
    writeSnapshot(weekStart, {
      ...before,
      updated_at: at,
      days: days.sort((a, b) => a.date.localeCompare(b.date)),
    });
    const after = snapshot(weekStart);
    record(weekStart, "update_day", before, after, at);
    return after.days.find((d) => d.date === date);
  });

  const deleteWeekTx = db.transaction((weekStart, at) => {
    assertMonday(weekStart);
    const before = snapshot(weekStart);
    if (!before)
      throw new NotFoundError(`the week of ${weekStart} has no plan`);
    writeSnapshot(weekStart, null);
    record(weekStart, "delete", before, null, at);
  });

  const undoTx = db.transaction((at) => {
    const target = pickUndoTarget(q.historyRows.all());
    if (!target) return null;
    const current = snapshot(target.week_start);
    const restored = target.before_json ? JSON.parse(target.before_json) : null;
    writeSnapshot(target.week_start, restored);
    record(target.week_start, "undo", current, restored, at, target.id);
    return {
      week_start: target.week_start,
      undid: target.kind,
      week: restored ? withAllDays(restored) : null,
    };
  });

  return {
    db,
    saveWeek: (plan, at) => withAllDays(saveWeekTx(plan, at)),
    updateDay: (date, fields, at) => updateDayTx(date, fields, at),
    deleteWeek: (weekStart, at) => deleteWeekTx(weekStart, at),
    undoLastChange: (at) => undoTx(at),

    // The week with all seven days (missing days empty), or null.
    getWeek(weekStart) {
      assertMonday(weekStart);
      const snap = snapshot(weekStart);
      return snap ? withAllDays(snap) : null;
    },

    // Stored weeks newest first, optionally limited to an inclusive range.
    listWeeks({ from, to } = {}) {
      for (const bound of [from, to]) {
        if (bound !== undefined && !isIsoDate(bound)) {
          throw new Error(`"${bound}" must be a date in YYYY-MM-DD format`);
        }
      }
      return q.weekStarts
        .all()
        .map((r) => r.week_start)
        .filter((ws) => (!from || ws >= from) && (!to || ws <= to))
        .sort()
        .reverse()
        .map((ws) => {
          const snap = snapshot(ws);
          return {
            week_start: ws,
            source: snap.source,
            status: snap.status,
            dinner_summary: dinnerSummary(snap.days),
          };
        });
    },

    // The first Monday from `currentMonday` onwards with no stored week.
    nextUnplannedMonday(currentMonday) {
      const planned = new Set(q.weekStarts.all().map((r) => r.week_start));
      let monday = currentMonday;
      while (planned.has(monday)) monday = addDays(monday, 7);
      return monday;
    },

    isEmpty: () => q.weekCount.get().n === 0,
    close: () => db.close(),
  };
}

function emptyDay(date) {
  return Object.fromEntries([
    ["date", date],
    ...DAY_FIELDS.map((f) => [f, null]),
  ]);
}

// Pad a snapshot to all seven days of its week.
function withAllDays(snap) {
  const byDate = new Map(snap.days.map((d) => [d.date, d]));
  return {
    ...snap,
    days: weekDates(snap.week_start).map((date) => ({
      ...emptyDay(date),
      ...byDate.get(date),
    })),
  };
}

function migrate(db) {
  const version = db.pragma("user_version", { simple: true });
  if (version === SCHEMA_VERSION) return;
  if (version !== 0) {
    throw new Error(
      `database schema version ${version} is newer than this app understands (${SCHEMA_VERSION})`,
    );
  }
  db.exec(SCHEMA);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}
