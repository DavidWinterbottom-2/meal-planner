# Design

## Context

The stock is in the Flatnotes note "Meals - Pantry": a Freezer line and a Cellar line, edited only by Claude. The app names that note as one of four rule notes but never reads it (`planning-mcp`: no Flatnotes calls or credentials). David asked for the simplest version: show the note on the phone with when it was last updated.

## Decisions

### The app owns the note, as plain text

Alternatives considered:

- **The viewer reads the Flatnotes note live.** Breaks the no-Flatnotes-credentials rule and adds a runtime dependency on Flatnotes.
- **Claude writes both the Flatnotes note and the app.** Two copies that drift as soon as one write is skipped.

One text field written by Claude keeps a single copy and needs no parsing. Structure (sections, items, validation) is a deliberate non-goal until free text proves too loose.

### Storage

Table `stock (id INTEGER PRIMARY KEY CHECK (id = 1), text TEXT NOT NULL, updated_at TEXT NOT NULL)`, the next step in the store's `MIGRATIONS`. An upsert replaces the single row. No history: Claude has the previous text in the chat, and the note is short.

### Age

Whole days between the save date and today, both as dates in the household timezone (Europe/Zurich, as for weeks), in one pure, exported helper used by `get_stock`, the planning context and the page.

### Viewer

- `GET /stock` renders through the shared layout (header, CSP, `no-store`). The text is escaped and shown with `white-space: pre-wrap`, so the note's lines and "- " bullets read as written, with no Markdown renderer.
- "Last updated Mon 12 Oct (3 days ago)", using the date label the week pages already use; "today" and "yesterday" for 0 and 1 days.
- The header's `.wb-acct` gains a stock icon button before Upload, with `aria-current` on `/stock`. The header must stay on one line at 390px, which the existing e2e check enforces. With one more 34px button it is tight [risk]. If it fails, shorten the brand on narrow screens to the `~` mark plus "Meals".
- Icon: the sprite has nothing fitting. Add Lucide `package` (ISC, like the others) as `wb-package` to `docker-infra/design-system/winterbottom-icons.svg`, then vendor the sprite here unchanged.
- Offline: add `/stock` to the service worker's page matcher and `WARM_PAGES`.

### Planning context

`buildPlanningContext` adds `stock` (the `get_stock` shape). `RULE_SECTIONS` drops `pantry`, and `MEALS_RULE_NOTE_PANTRY` is no longer read. The description says where the stock comes from and how to update it, nothing more.

## Risks / Trade-offs

- **The note still goes stale.** No prompts or warnings, by choice. The date on the page makes the age visible, which the Flatnotes note didn't.
- **Header crowding at 390px.** Covered by the e2e check and the fallback above.
- **Edits to the old note are lost.** Anyone who edits the old Flatnotes note after the move edits a dead copy. The pointer text covers it.

## Migration Plan

1. Merge the design-system icon (docker-infra), then this change.
2. Deploy, then reconnect the claude.ai connector so the new tools appear.
3. In a Claude chat: copy "Meals - Pantry" in with `update_stock`, then replace the note body with "Stock now lives in the meal planner (meals.winterbottom.xyz/stock); Claude updates it."

Rollback: the previous image ignores the `stock` table. Roll back before step 3 if possible, so the note keeps its old text.
