# Proposal

## Why

David wants to see what's in the freezer and the cellar from his phone, from a header button in the viewer, together with when the list was last updated. Today it lives in the Flatnotes note "Meals - Pantry", which only Claude edits. The viewer can't show that note directly, because the app must not call Flatnotes or hold Flatnotes credentials (`planning-mcp`).

Simplest version that keeps that rule: the stock note moves into the app as one block of text. Claude writes it through MCP, and the viewer shows it with its last-updated date.

## What Changes

- The app stores one **stock note**: free text, with the time it was last saved.
- New MCP tools: `get_stock` and `update_stock(text)`, which replaces the note.
- `get_planning_context` returns the stock note, so the pantry stops being a Flatnotes rule note (`rule_notes` names three: household, meal bank, recipes).
- Viewer: a header icon button opens `/stock`, showing the note's text and "Last updated <date> (N days ago)". It works offline like the week pages.
- After deploy, Claude copies the Flatnotes note into the app and replaces the note body with a pointer to the app.

## Non-goals

- Separate freezer and cellar lists, item validation, quantities or expiry. The note is free text, written the way the Flatnotes note is today.
- Staleness warnings, or instructions telling Claude to refresh old stock. The date is shown; that's all.
- History of earlier versions. A save replaces the note.
- Editing in the viewer. Claude is the only writer.
- The app reading Flatnotes. Still forbidden.

## Capabilities

### New Capabilities

- `kitchen-stock`: storing the stock note, the MCP tools that read and replace it, and the viewer's stock page.

### Modified Capabilities

- `planning-mcp`: the planning context includes the stock note, and the rule notes drop from four to three.

## Impact

- A new store migration (a one-row `stock` table). No new dependencies.
- Two new MCP tools. Claude's connector picks them up after a reconnect.
- The viewer gets a header button and a page; the service worker caches the page.
- The design-system icon sprite gains a stock icon, a small docker-infra PR vendored back here.
- `MEALS_RULE_NOTE_PANTRY` is no longer read. Harmless if it is still set.
