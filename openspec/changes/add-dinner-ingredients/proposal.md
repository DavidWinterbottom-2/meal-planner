# Proposal

## Why

When cooking, David wants to see what that day's dinner needs without opening the recipes note. The app stores each dinner as one line of text and can't read the recipes (they live in Flatnotes, which the app must not call), so the ingredients have to be written by Claude when it saves the plan, from the "Meals - Recipes" note.

## What Changes

- A day gains an optional `ingredients` field: free text, one ingredient per line. `save_week_plan` and `update_day` accept it like the other day fields, and undo covers it.
- The planning description tells Claude to fill it in for each cooked dinner when saving, from the recipes note, marking anything to take out of the freezer with "(freezer)".
- The viewer shows an **Ingredients** fold-out under a day's dinner when the day has ingredients. Being part of the week page, it works offline.
- `get_week_plan`'s text view includes the ingredients.

## Non-goals

- A week shopping list, or subtracting the stock. That's a separate idea (and could go straight onto Cozi).
- Ingredients for lunch or snacks.
- Quantities as structured data, or scaling by servings.
- The app reading the recipes note. Still forbidden.
- Filling in ingredients for weeks already saved. Claude can add them with `update_day` when asked.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meal-plans`: a day carries an optional `ingredients` field, and the viewer shows it.

## Impact

- A store migration adds `day.ingredients`. Older history snapshots restore with no ingredients.
- The MCP day schema and two descriptions change; the connector picks them up after a reconnect.
- The week page gets a fold-out per day; no new routes.
