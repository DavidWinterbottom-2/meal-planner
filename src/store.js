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
import { dishKey, isSkippedDish, DEFAULT_SKIP } from "./images/dish.js";

// Schema migrations, applied in order. The database's `user_version` is the
// number of steps already applied. Never edit a step once it has shipped;
// add a new one instead.
const MIGRATIONS = [
  // 1: weeks, days and the append-only history.
  `
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
-- History is append-only: refuse any change to a row once written.
CREATE TRIGGER history_no_update BEFORE UPDATE ON history
BEGIN SELECT RAISE(ABORT, 'history is append-only'); END;
CREATE TRIGGER history_no_delete BEFORE DELETE ON history
BEGIN SELECT RAISE(ABORT, 'history is append-only'); END;
`,
  // 2: one generated picture per distinct dinner (OpenSpec add-dish-images).
  `
CREATE TABLE dish_image (
  key        TEXT PRIMARY KEY,
  dish_text  TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('pending', 'done', 'failed', 'skipped')),
  attempts   INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  updated_at TEXT NOT NULL
);
`,
  // 3: Lisa's original plan images (OpenSpec add-lisa-image-upload). The
  // week points at its image, so week snapshots (and so undo) carry it.
  `
CREATE TABLE image (
  id            TEXT PRIMARY KEY,
  filename      TEXT NOT NULL,
  original_name TEXT,
  uploaded_at   TEXT NOT NULL
);
ALTER TABLE week ADD COLUMN image_id TEXT REFERENCES image(id);
`,
];

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
      `INSERT INTO week (week_start, source, status, prep, notes, updated_at, image_id)
       VALUES (@week_start, @source, @status, @prep, @notes, @updated_at, @image_id)`,
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
    // Only what pickUndoTarget needs; the target's snapshot is read by id.
    historyRows: db.prepare("SELECT id, kind, undoes_id FROM history"),
    historyEntry: db.prepare(
      "SELECT id, week_start, kind, before_json FROM history WHERE id = ?",
    ),
    weekCount: db.prepare("SELECT count(*) AS n FROM week"),
    historyCount: db.prepare("SELECT count(*) AS n FROM history"),
    weekStarts: db.prepare("SELECT week_start FROM week"),
    dinners: db.prepare(
      "SELECT DISTINCT dinner FROM day WHERE dinner IS NOT NULL AND dinner <> ''",
    ),
    insertDish: db.prepare(
      `INSERT OR IGNORE INTO dish_image (key, dish_text, status, updated_at)
       VALUES (@key, @dish_text, @status, @updated_at)`,
    ),
    dish: db.prepare("SELECT * FROM dish_image WHERE key = ?"),
    nextPendingDish: db.prepare(
      "SELECT * FROM dish_image WHERE status = 'pending' ORDER BY updated_at, key LIMIT 1",
    ),
    updateDish: db.prepare(
      `UPDATE dish_image SET status = @status, attempts = @attempts, error = @error,
       updated_at = @updated_at WHERE key = @key`,
    ),
    insertImage: db.prepare(
      `INSERT INTO image (id, filename, original_name, uploaded_at)
       VALUES (@id, @filename, @original_name, @uploaded_at)`,
    ),
    image: db.prepare("SELECT * FROM image WHERE id = ?"),
    imageIds: db.prepare("SELECT id FROM image"),
    upsertDish: db.prepare(
      `INSERT INTO dish_image (key, dish_text, status, attempts, error, updated_at)
       VALUES (@key, @dish_text, @status, 0, NULL, @updated_at)
       ON CONFLICT(key) DO UPDATE SET status = excluded.status, attempts = 0,
       error = NULL, updated_at = excluded.updated_at`,
    ),
  };

  // The stored week with its stored days only (no padding), or null.
  function snapshot(weekStart) {
    const week = q.week.get(weekStart);
    if (!week) return null;
    const days = q.days.all(weekStart).map(({ week_start, ...day }) => day);
    return { ...week, days };
  }

  // Replace whatever is stored for the snapshot's week with the snapshot.
  // This is the single place that rewrites a week and all its child rows:
  // a table added under `week` must be written (and read in snapshot())
  // here, or undo and update_day will silently drop it.
  function writeSnapshot(weekStart, snap) {
    q.deleteWeek.run(weekStart);
    if (!snap) return;
    const { days, ...week } = snap;
    q.insertWeek.run({ image_id: null, ...week });
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
        // Transcribing Lisa's image keeps it attached.
        image_id: before?.image_id ?? null,
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
    // null/undefined mean "not given" (some clients send null for every
    // optional field); only an empty string clears a field.
    const given = Object.fromEntries(
      Object.entries(fields ?? {}).filter(
        ([, v]) => v !== null && v !== undefined,
      ),
    );
    const changes = cleanDayFields(given);
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

  // Attach an uploaded image to a week, replacing any earlier one. A week
  // with no plan is created as image_only, from Lisa. Recorded in history
  // like any other write, so undo restores the week as it was.
  const attachImageTx = db.transaction(
    (weekStart, { id, filename, original_name }, at) => {
      assertMonday(weekStart);
      q.insertImage.run({
        id,
        filename,
        original_name: cleanText(original_name),
        uploaded_at: at,
      });
      const before = snapshot(weekStart);
      writeSnapshot(
        weekStart,
        before
          ? { ...before, image_id: id, updated_at: at }
          : {
              week_start: weekStart,
              source: "Lisa",
              status: "image_only",
              prep: null,
              notes: null,
              updated_at: at,
              image_id: id,
              days: [],
            },
      );
      const after = snapshot(weekStart);
      record(weekStart, before ? "replace" : "create", before, after, at);
      return withAllDays(after);
    },
  );

  const undoTx = db.transaction((at) => {
    const picked = pickUndoTarget(q.historyRows.all());
    if (!picked) return null;
    const target = q.historyEntry.get(picked.id);
    const current = snapshot(target.week_start);
    const restored = target.before_json
      ? normalizeSnapshot(JSON.parse(target.before_json))
      : null;
    writeSnapshot(target.week_start, restored);
    record(target.week_start, "undo", current, restored, at, target.id);
    return {
      week_start: target.week_start,
      undid: target.kind,
      week: restored ? withAllDays(restored) : null,
    };
  });

  return {
    // Raw handle for tests only; production code goes through the methods.
    _db: db,
    saveWeek: (plan, at) => withAllDays(saveWeekTx(plan, at)),
    updateDay: (date, fields, at) => updateDayTx(date, fields, at),
    deleteWeek: (weekStart, at) => deleteWeekTx(weekStart, at),
    undoLastChange: (at) => undoTx(at),
    attachImage: (weekStart, image, at) => attachImageTx(weekStart, image, at),
    getImage: (id) => q.image.get(id) ?? null,
    imageIds: () => new Set(q.imageIds.all().map((r) => r.id)),

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

    // --- dish pictures (OpenSpec add-dish-images) ---

    // Give every distinct stored dinner a dish_image row: pending, or skipped
    // when it isn't a cooked dish. Covers saves, day updates, undo and the
    // first-run backfill alike. Returns how many rows were added.
    syncDishImages(at, skip = DEFAULT_SKIP) {
      let added = 0;
      db.transaction(() => {
        for (const { dinner } of q.dinners.all()) {
          added += q.insertDish.run({
            key: dishKey(dinner),
            dish_text: dinner,
            status: isSkippedDish(dinner, skip) ? "skipped" : "pending",
            updated_at: at,
          }).changes;
        }
      })();
      return added;
    },
    nextPendingDish: () => q.nextPendingDish.get() ?? null,
    getDish: (key) => q.dish.get(key) ?? null,
    updateDish: (key, { status, attempts, error = null }, at) =>
      q.updateDish.run({ key, status, attempts, error, updated_at: at }),

    // Status of each key that has a row: key -> { status, updated_at }.
    dishImages(keys) {
      const out = new Map();
      for (const key of new Set(keys)) {
        const row = q.dish.get(key);
        if (row) out.set(key, row);
      }
      return out;
    },

    // Throw a dinner's picture away and queue a new one.
    regenerateDish(dinner, at, skip = DEFAULT_SKIP) {
      const text = cleanText(dinner);
      if (!text) throw new Error("dinner is required");
      if (isSkippedDish(text, skip))
        throw new Error(
          `"${text}" is on the skip list (eating out, leftovers, Kita…), so it never gets a picture`,
        );
      const key = dishKey(text);
      q.upsertDish.run({
        key,
        dish_text: text,
        status: "pending",
        updated_at: at,
      });
      return q.dish.get(key);
    },

    // True only for a database that has never held a week, so deleting every
    // week never brings the seed examples back.
    isPristine: () => q.weekCount.get().n === 0 && q.historyCount.get().n === 0,
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

// Snapshots in history are a stored format, not a dump of today's columns:
// a row written before a column existed must still restore. Fill every
// field the current schema expects, defaulting what an older snapshot lacks.
export function normalizeSnapshot(snap) {
  return {
    week_start: snap.week_start,
    source: snap.source ?? "David",
    status: snap.status ?? "data",
    prep: snap.prep ?? null,
    notes: snap.notes ?? null,
    updated_at: snap.updated_at,
    // Snapshots from before images existed have no image.
    image_id: snap.image_id ?? null,
    days: (snap.days ?? []).map((d) => ({ ...emptyDay(d.date), ...d })),
  };
}

// Apply every migration step the database hasn't had yet, each in its own
// transaction together with its user_version bump.
export function migrate(db, migrations = MIGRATIONS) {
  const version = db.pragma("user_version", { simple: true });
  if (version > migrations.length) {
    throw new Error(
      `database schema version ${version} is newer than this app understands (${migrations.length})`,
    );
  }
  for (let step = version; step < migrations.length; step++) {
    db.transaction(() => {
      db.exec(migrations[step]);
      db.pragma(`user_version = ${step + 1}`);
    })();
  }
}
