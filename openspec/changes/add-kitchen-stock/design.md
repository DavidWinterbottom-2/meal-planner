# Design

## Context

The stock is in the Flatnotes note "Meals - Pantry": two lines, Freezer and Cellar, last touched 6 Sep 2026 and marked "likely out of date". The app names that note as one of four rule notes but never reads it (`planning-mcp`: no Flatnotes calls or credentials). Claude is the only writer; Lisa doesn't edit it. The viewer is read-only apart from uploads, behind the entra-auth-proxy sidecar, and works offline through the service worker.

## Goals / Non-Goals

**Goals:** stock David can trust on his phone, kept current as a side effect of planning, with its age always visible.

**Non-Goals:** see the proposal. In short: no editing in the viewer, no quantities or expiry, no Flatnotes reads.

## Decisions

### The app owns the stock, not Flatnotes

Alternatives considered:

- **The viewer reads the note live.** Breaks the no-Flatnotes-credentials rule, adds a runtime dependency on Flatnotes, and still shows a stale list.
- **Claude writes both the note and the app.** Two copies that drift whenever one write is skipped.
- **A header link to the note in Flatnotes.** No code, but it needs a Flatnotes login on the phone and does nothing about staleness.

Owning it here gives one copy, a visible age, and `get_planning_context` can hand it to Claude at the moment it is useful. The cost: hand edits now go through Claude. That's acceptable, since Claude is already the only writer.

### Replace a whole section, not add/remove items

`update_stock(section, items)` takes the full list. Claude reads the stock (it has it from `get_planning_context` or `get_stock`), edits it in chat, and writes it back. One tool, no partial-update edge cases (removing an item that isn't there, near-duplicate names), and the saved list is exactly what David agreed to in chat. Add/remove tools can come later if whole-list writes prove clumsy.

### Append-only rows

Table `stock (id INTEGER PRIMARY KEY, section TEXT CHECK (section IN ('freezer','cellar')), items TEXT /* JSON array */, updated_at TEXT)`, added as the next step in the store's `MIGRATIONS`. Each save inserts a row; the latest per section is the current list. This mirrors the week history's spirit (nothing is lost) without hooking into `undo_last_change`, whose snapshot model is about weeks. Rows are small, written a few times a month, and need no pruning.

### Validation and normalising

Trim, drop blanks, drop case-insensitive duplicates keeping the first, then check ≤80 characters per item and ≤100 items. Zod for the tool's input shape, with the rules in a pure, exported `normaliseStockItems` that the store also calls, so the viewer can never show a list the tool would have refused.

### Age and staleness

Age = whole days between the update date and today, both as dates in the household timezone (Europe/Zurich, as for weeks). `STALE_AFTER_DAYS = 14`, one exported constant used by the viewer pill and the tool description. Two weeks is about one freezer cycle between big shops [assumption; easy to change].

### Planning context and rule notes

`buildPlanningContext` adds `stock` (the same shape as `get_stock`). `RULE_SECTIONS` drops `pantry`, and `MEALS_RULE_NOTE_PANTRY` is no longer read. The description gains the refresh, freezer-first and offer-to-update instructions. The instructions are text, not enforcement, because the app can't make Claude ask; the visible age in the viewer is the backstop.

### Viewer

- `GET /stock` renders through the same layout, so it gets the header, CSP and `no-store` like the other pages.
- The header's `.wb-acct` gains a stock icon button before Upload, with `aria-current` on `/stock`. The header must stay on one line at 390px; the e2e check already enforces it. With one more 34px button this is tight [risk]. If it fails, shorten the brand on narrow screens to the `~` mark plus "Meals".
- Icon: the sprite has nothing fitting. Add a Lucide `package` (ISC, like the others) as `wb-package` in `docker-infra/design-system/winterbottom-icons.svg`, then vendor the sprite here unchanged.
- Offline: add `/stock` to the service worker's page matcher and `WARM_PAGES`.

### Moving the note's data

A manual step after deploy, done by Claude in a chat: read "Meals - Pantry", call `update_stock` for each section, show David the result, then replace the note body with "Stock now lives in the meal planner (meals.winterbottom.xyz/stock); Claude updates it." The note is kept, not deleted, so old links still explain where the stock went.

## Risks / Trade-offs

- **Claude doesn't follow the description and the stock still goes stale.** Mitigation: the age and the warning pill make staleness visible, and the planning context carries the age, so Claude sees it too. Accepted: it is still a big step up from a silent note.
- **Header crowding at 390px.** Covered by the existing e2e check and the fallback above.
- **Lost hand edits.** Anyone who edits the old note after the move edits a dead copy. The pointer text covers it.

## Migration Plan

1. Merge the design-system icon (docker-infra), then this change.
2. Deploy, then reconnect the claude.ai connector so the new tools show up.
3. In a Claude chat: move the note's lists in, then point the note at the app.
4. Optionally remove `MEALS_RULE_NOTE_PANTRY` from the Pi's `.env` (it is ignored either way).

Rollback: the previous image ignores the `stock` table. The note still has its old text until step 3, so roll back before step 3 if possible.

## Open Questions

- Is 14 days the right staleness threshold? Assumed; confirm with David after a month of use.
