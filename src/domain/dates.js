// Calendar helpers for Monday–Sunday weeks in Europe/Zurich.
//
// Dates are handled as ISO "YYYY-MM-DD" strings throughout, and arithmetic is
// done on UTC midnights, so no calculation ever crosses a DST boundary.

export const TIME_ZONE = "Europe/Zurich";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function toUtc(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(dt) {
  return dt.toISOString().slice(0, 10);
}

// A real calendar date in YYYY-MM-DD form (rejects 2026-02-30, 12/10/2026, …).
export function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  return fromUtc(toUtc(value)) === value;
}

export function addDays(date, days) {
  return fromUtc(new Date(toUtc(date).getTime() + days * DAY_MS));
}

export function weekdayName(date) {
  return WEEKDAYS[toUtc(date).getUTCDay()];
}

export function isMonday(date) {
  return isIsoDate(date) && toUtc(date).getUTCDay() === 1;
}

// The Monday of the week containing `date`.
export function weekOf(date) {
  const offset = (toUtc(date).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(date, -offset);
}

// The Monday closest to `date` (Tue–Thu → back, Fri–Sun → forward).
export function nearestMonday(date) {
  const offset = (toUtc(date).getUTCDay() + 6) % 7;
  return offset <= 3 ? addDays(date, -offset) : addDays(date, 7 - offset);
}

// The seven dates of the week starting on `weekStart`.
export function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

// Today's date in Europe/Zurich for the instant `now`.
export function zurichToday(now) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Resolve "current" / "next" / "previous" (relative to `now`) or a
// YYYY-MM-DD Monday to a week_start. Throws on anything else.
export function resolveWeek(spec, now) {
  const current = weekOf(zurichToday(now));
  if (spec === "current") return current;
  if (spec === "next") return addDays(current, 7);
  if (spec === "previous") return addDays(current, -7);
  assertMonday(spec);
  return spec;
}

// Throws a message Claude can act on when `weekStart` is not a Monday.
export function assertMonday(weekStart) {
  if (!isIsoDate(weekStart)) {
    throw new Error(
      `week_start "${weekStart}" must be a date in YYYY-MM-DD format`,
    );
  }
  if (!isMonday(weekStart)) {
    throw new Error(
      `week_start ${weekStart} is a ${weekdayName(weekStart)}, not a Monday. ` +
        `Did you mean ${nearestMonday(weekStart)}?`,
    );
  }
}
