// The two example weeks from the original brief, seeded into an empty
// database on first start so the viewer and get_planning_context have history.

const KITA = "Kita";

export const SEED_WEEKS = [
  {
    week_start: "2026-10-05",
    source: "David",
    prep: [
      "Sun 11 morning, before the museum trip:",
      "- batch fish nuggets and fish fingers for the freezer",
      "- extra meatballs, some frozen",
      "- ranch dip and veggie sticks",
      "- top up the Hidden Veg Pasta Sauce",
    ].join("\n"),
    days: [
      {
        date: "2026-10-05",
        lunch: KITA,
        dinner: "Hidden Veg Pasta Sauce + spaghetti",
      },
      {
        date: "2026-10-06",
        lunch: KITA,
        dinner: "Fish with Lemon Sage Butter + broccoli/peas",
        note: "David out: Lisa & Thomas",
      },
      {
        date: "2026-10-07",
        lunch: KITA,
        dinner: "Sausages + mash + peas/broccoli",
      },
      {
        date: "2026-10-08",
        morning_snack: "Fruit",
        lunch: "Leftover sausages + veggie sticks",
        afternoon_snack: "Cottage cheese + veggie sticks",
        dinner: "Tasty Veg Quesadillas",
      },
      {
        date: "2026-10-09",
        morning_snack: "Crackers + cheese",
        lunch: "Bread + Hidden Veg Pasta Sauce + cheese, toasted",
        afternoon_snack: "Mango avocado ice cream + fruit",
        dinner: "Marinated salmon + rice/potatoes + veg",
      },
      {
        date: "2026-10-10",
        morning_snack: "Fruit + nut butter",
        lunch: "Leftover salmon + rice/veg",
        afternoon_snack: "Crackers + cheese",
        dinner: "Älplermagronen with mince & apple sauce",
      },
      {
        date: "2026-10-11",
        morning_snack: "Fruit",
        lunch: "Eggs & toast + carrot sticks + Babybel",
        afternoon_snack: "Crackers + cheese",
        dinner: "BBQ-style roast chicken + special chips + veg + ranch dip",
        note: "Museum trip 1–5pm; prep in the morning",
      },
    ],
  },
  {
    week_start: "2026-10-12",
    source: "David",
    days: [
      {
        date: "2026-10-12",
        lunch: KITA,
        dinner:
          "Homestyle Fish Nuggets + special chips + veggie sticks + ranch dip",
      },
      {
        date: "2026-10-13",
        lunch: KITA,
        dinner: "Fish fingers + carrot chips + peas + ranch dip",
        note: "David out: Lisa & Thomas",
      },
      {
        date: "2026-10-14",
        lunch: KITA,
        dinner: "Meatballs + mash + peas/broccoli (from freezer)",
      },
      {
        date: "2026-10-15",
        morning_snack: "Fruit",
        lunch: "Leftover fish fingers + veggie sticks",
        afternoon_snack: "Cottage cheese + veggie sticks",
        dinner: "Mild prawn ramen/noodles",
        note: "Cleaner 1:30–5pm",
      },
      {
        date: "2026-10-16",
        morning_snack: "Crackers + cheese",
        lunch: "Bread + Hidden Veg Pasta Sauce + cheese, toasted",
        afternoon_snack: "Homemade ice cream + fruit",
        dinner: "Homemade pizza",
      },
      {
        date: "2026-10-17",
        morning_snack: "Fruit + nut butter",
        lunch: "Eggs & toast + carrot sticks + Babybel",
        afternoon_snack: "Crackers + cheese",
        dinner: "Roast beef or pork + roast potatoes, veg & gravy",
        note: "Thomas swim 1:15pm",
      },
      {
        date: "2026-10-18",
        morning_snack: "Fruit",
        lunch: "Frozen creamy spinach + pasta",
        afternoon_snack: "Nut butter + bread or veggie sticks",
        dinner: "BBQ chicken pieces + special chips + veg",
      },
    ],
  },
];

// Seed only into a database that has never held a week, through the store so the seeds appear in
// history like any other save. Returns the number of weeks seeded.
export function seedIfEmpty(store, at, weeks = SEED_WEEKS) {
  if (!store.isPristine()) return 0;
  for (const week of weeks) store.saveWeek(week, at);
  return weeks.length;
}
