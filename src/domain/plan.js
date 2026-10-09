// Rules for a week's plan, independent of storage.

import {
  assertMonday,
  isIsoDate,
  shortWeekday,
  weekDates,
  weekOf,
} from "./dates.js";

export const DAY_FIELDS = [
  "morning_snack",
  "lunch",
  "afternoon_snack",
  "dinner",
  "note",
];

// Blank or missing text is stored as null so "empty" has one representation.
export function cleanText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// Pick and clean the known day fields from `fields`. Unknown keys are ignored.
export function cleanDayFields(fields) {
  const out = {};
  for (const key of DAY_FIELDS) {
    if (key in fields) out[key] = cleanText(fields[key]);
  }
  return out;
}

// Validate a whole-week save. Throws with a specific message; returns the
// days cleaned and sorted by date.
export function validatePlan(weekStart, days) {
  assertMonday(weekStart);
  if (!Array.isArray(days)) throw new Error("days must be a list");
  const inWeek = new Set(weekDates(weekStart));
  const seen = new Set();
  const cleaned = days.map((day) => {
    const date = day?.date;
    if (!isIsoDate(date)) {
      throw new Error(`day date "${date}" must be a date in YYYY-MM-DD format`);
    }
    if (!inWeek.has(date)) {
      throw new Error(
        `day ${date} is outside the week of ${weekStart} ` +
          `(${weekStart} to ${weekDates(weekStart)[6]}); it belongs to the week of ${weekOf(date)}`,
      );
    }
    if (seen.has(date)) throw new Error(`day ${date} appears more than once`);
    seen.add(date);
    return { date, ...cleanDayFields(day) };
  });
  return cleaned.sort((a, b) => a.date.localeCompare(b.date));
}

// One line summarising a week's dinners in day order, e.g.
// "Mon pasta · Tue fish · …", cut to `maxLen` characters.
export function dinnerSummary(days, maxLen = 120) {
  const parts = [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((d) => d.dinner)
    .map((d) => `${shortWeekday(d.date)} ${d.dinner}`);
  const line = parts.join(" · ");
  if (line === "") return "(no dinners)";
  return line.length <= maxLen
    ? line
    : `${line.slice(0, maxLen - 1).trimEnd()}…`;
}
