# Proposal

## Why

David wants to see what's in the freezer and the cellar from his phone, from a header button in the viewer. Today the stock lives in the Flatnotes note "Meals - Pantry", which opens with "_As of 6 Sep 2026, likely out of date._": nothing prompts anyone to update it, so it drifts. Lisa never edits it; only Claude does. Showing that note in the viewer would mean the app reading Flatnotes, which `planning-mcp` forbids (no Flatnotes calls, no Flatnotes credentials), and would only put a stale list on the phone.

The useful change is to make the stock part of meal planning: the app holds it, Claude keeps it current through MCP while planning, and the viewer shows it with its age so a stale list is obvious.

## What Changes

- The app stores two stock lists, **Freezer** and **Cellar**, each with when it was last updated. Every save is kept (append-only), so an earlier list can be recovered.
- New MCP tools: `get_stock` and `update_stock(section, items)`, which replaces one section's list.
- `get_planning_context` returns the stock and its age. Its description tells Claude to:
  - ask David what was used up or bought when a section is older than 14 days or empty, and update it before drafting;
  - favour freezer items in the plan;
  - after saving a plan that uses freezer items, offer to take them off the list.
- The pantry stops being a Flatnotes rule note: `rule_notes` names three notes (household, meal bank, recipes). After deploy, Claude moves the note's lists in with `update_stock` and replaces the note body with a pointer to the app.
- Viewer: a header icon button opens a read-only `/stock` page, Freezer then Cellar. Each list shows "updated N days ago", with a warning pill when older than 14 days. The page works offline like the week pages.

## Non-goals

- Editing stock in the viewer. The viewer stays read-only apart from uploads; Claude is the only writer.
- Quantities, units, expiry dates or locations within the freezer. Items are short free text ("mince ×2", "salmon fillets").
- Other sections (fridge, spice drawer).
- Working out stock automatically from the plan (each saved dinner ticking items off). Claude offers it; David confirms.
- Undo of stock changes through `undo_last_change`, which stays about weeks. Earlier lists are kept in the database but not exposed as a tool.
- The app reading Flatnotes. Still forbidden.

## Capabilities

### New Capabilities

- `kitchen-stock`: storing the freezer and cellar lists, the MCP tools that read and replace them, and the viewer's stock page.

### Modified Capabilities

- `planning-mcp`: the planning context includes the stock, and the rule notes drop from four to three.

## Impact

- A new store migration (a `stock` table). No new dependencies.
- The MCP tool list grows by two. Claude's connector picks them up on its next session.
- The viewer gets a header button and a page; the service worker caches the page.
- The design-system icon sprite gains a stock icon, a small docker-infra PR vendored back here.
- `MEALS_RULE_NOTE_PANTRY` is no longer read. Harmless if it is still set in the Pi's `.env`.
- One-off manual step after deploy: move the note's lists into the app, then point the note at the app.
