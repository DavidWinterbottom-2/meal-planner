# Proposal

## Why

David plans the family meals every two weeks with Claude, and the plans end up lost in chat and WhatsApp image history. Claude needs a durable, structured place to save plans, edit a day, read past weeks, and load the household planning rules. Then each new plan builds on history instead of on re-pasted notes. This change is the core that every later surface (viewer, PNG, Lisa's images) reads from.

## What Changes

- A SQLite store for weekly plans: `week` (Monday-keyed, source, status, prep, notes), `day` (morning snack, lunch, afternoon snack, dinner, note), and an append-only `history` log of every write.
- Validation: `week_start` must be a Monday, and every day must fall inside that Mon–Sun week (Europe/Zurich).
- An MCP server (StreamableHTTP at `/mcp`) with these tools:
  - `get_planning_context(weeks_back=6)`: the titles of the 4 Flatnotes rule notes (for Claude to read with its Flatnotes connector), the last N weeks, any `image_only` flags, and the next Monday with no plan. Its description tells Claude to call it first when planning.
  - `save_week_plan`, `update_day`, `get_week_plan(week_start | current | next | previous)`, `list_weeks(from?, to?)`, `delete_week`, `undo_last_change`.
- The planning rules live in 4 Flatnotes notes. The app never calls Flatnotes and holds no Flatnotes credentials; Claude reads the notes with its own connector.
- Auth: the shared OAuth2 module vendored from `mcp-development/shared/` (only after its self-approval fix has merged) plus `x-api-key`.
- The two example weeks from the brief (2026-10-05, 2026-10-12, source David) are seeded on first start into an empty database.
- A paste-in Claude prompt (`docs/seed-flatnotes-rules.md`) that creates the 4 rule notes through the Flatnotes connector.

## Non-goals

- Any web UI, PNG rendering or image storage (later changes).
- Writing to Flatnotes. Rules are edited with the existing Flatnotes connector, so there are no `update_rules` / `get_rules` tools.
- Several plans per week. A save replaces the week (David and Lisa never plan the same week), and undo covers mistakes.
- Auto-filling "Kita". Claude writes it from the household rules.
- Backups (a known gap, recorded in the README).
- `get_week_links` (dropped; sharing is the PNG image itself).

## Capabilities

### New Capabilities

- `meal-plans`: weekly meal plan data. Week and day rules, week resolution (current, next, previous) in Europe/Zurich, the change history, and undo.
- `planning-mcp`: the MCP tool surface Claude uses, its authentication, and the planning-context bundle naming the Flatnotes rule notes.

### Modified Capabilities

None (greenfield).

## Impact

- New code in `src/` (store, domain helpers, MCP server, HTTP host). New dependencies: `express`, `better-sqlite3`, `@modelcontextprotocol/sdk`, `zod`.
- No Flatnotes dependency at runtime: no credentials and no network call.
- **Depends on** the mcp-development fix that gates the OAuth consent page. Do not vendor the module before that merges.
