// Pure view models for the viewer pages: no HTTP, no HTML. Everything the
// templates show is decided here so it can be unit-tested directly.

import {
  addDays,
  dayLabel,
  daysBetween,
  monthShort,
  shortWeekday,
  weekDates,
  weekOf,
} from "../domain/dates.js";

// "This week", "Next week", "Last week", "In N weeks", "N weeks ago".
export function weekBadge(weekStart, today) {
  const weeks = daysBetween(weekOf(today), weekStart) / 7;
  if (weeks === 0) return "This week";
  if (weeks === 1) return "Next week";
  if (weeks === -1) return "Last week";
  return weeks > 1 ? `In ${weeks} weeks` : `${-weeks} weeks ago`;
}

// "Mon 12 – Sun 18 Oct", or "Mon 28 Sep – Sun 4 Oct" across a month end.
export function weekHeading(weekStart) {
  const end = addDays(weekStart, 6);
  const day = (d) => `${shortWeekday(d)} ${Number(d.slice(8))}`;
  const startMonth = monthShort(weekStart);
  const endMonth = monthShort(end);
  return startMonth === endMonth
    ? `${day(weekStart)} – ${day(end)} ${endMonth}`
    : `${day(weekStart)} ${startMonth} – ${day(end)} ${endMonth}`;
}

export const sourceLabel = (source) => `${source || "David"}'s plan`;

// A lunch of exactly "Kita" reads as where Thomas is, not as a meal.
export const lunchLabel = (lunch) =>
  lunch?.trim() === "Kita" ? "Thomas at Kita" : lunch || null;

function snacks(day) {
  const parts = [day.morning_snack, day.afternoon_snack].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// The model for one week page. `week` is the store's week (all 7 days) or
// null when nothing is planned; `weekStart` is the Monday being viewed.
export function buildWeekView(week, weekStart, today) {
  const currentMonday = weekOf(today);
  const days = week?.days ?? weekDates(weekStart).map((date) => ({ date }));
  return {
    weekStart,
    heading: weekHeading(weekStart),
    badge: weekBadge(weekStart, today),
    isCurrent: weekStart === currentMonday,
    planned: Boolean(week),
    source: week ? sourceLabel(week.source) : null,
    prep: week?.prep ?? null,
    notes: week?.notes ?? null,
    prev: addDays(weekStart, -7),
    next: addDays(weekStart, 7),
    days: days.map((d) => {
      const lunch = lunchLabel(d.lunch);
      const snack = snacks(d);
      return {
        date: d.date,
        label: dayLabel(d.date),
        isToday: d.date === today,
        dinner: d.dinner || null,
        lunch,
        kita: lunch === "Thomas at Kita",
        snacks: snack,
        note: d.note || null,
        empty: !(d.dinner || lunch || snack || d.note),
      };
    }),
  };
}

// The model for /history: every stored week, newest first.
export function buildHistoryView(weeks) {
  return weeks.map((w) => ({
    weekStart: w.week_start,
    heading: weekHeading(w.week_start),
    source: sourceLabel(w.source),
    status: w.status,
    dinners: w.dinner_summary,
  }));
}
