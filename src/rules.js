// The four Flatnotes notes that hold the household's planning rules. The
// app never reads them: it only names them, and Claude reads them with its
// own Flatnotes connector, so this service holds no Flatnotes credentials.

export const RULE_SECTIONS = ["household", "meal_bank", "recipes", "pantry"];

export const DEFAULT_RULE_TITLES = {
  household: "Meals - Household",
  meal_bank: "Meals - Meal Bank",
  recipes: "Meals - Recipes",
  pantry: "Meals - Pantry",
};

// Note titles, each overridable with MEALS_RULE_NOTE_<SECTION>.
export function ruleTitlesFromEnv(env) {
  return Object.fromEntries(
    RULE_SECTIONS.map((section) => [
      section,
      env[`MEALS_RULE_NOTE_${section.toUpperCase()}`] ||
        DEFAULT_RULE_TITLES[section],
    ]),
  );
}
