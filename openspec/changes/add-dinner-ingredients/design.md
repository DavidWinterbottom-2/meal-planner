# Design

## Decisions

- **One more day field.** `ingredients` joins `DAY_FIELDS`, so storage, `update_day`, history snapshots and undo all pick it up with no special cases. Migration 5 adds the column; `normalizeSnapshot` already fills missing day fields with null, so older snapshots restore cleanly.
- **Free text, one per line.** Like the rest of the plan. The limit is 1000 characters (the other day fields allow 500; a long recipe's list needs more).
- **A `<details>` fold-out, not a button and a page.** No script, nothing new for the CSP or the service worker, works offline with the week page, and keeps the day in view. Lines are split on newlines, trimmed, and a leading "-", "*" or "•" is dropped.
- **Instructions in `get_planning_context`.** That's where the planning steps already live. The "(freezer)" marker is a convention for the night-before defrost, not parsed by the app.

## Risks / Trade-offs

- Claude may skip ingredients on some saves. The fold-out then doesn't appear, which is harmless.
- The ingredients are only as good as the recipes note.
