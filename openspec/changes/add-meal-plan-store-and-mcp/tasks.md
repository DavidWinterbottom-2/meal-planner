# Tasks

## 1. Setup

- [ ] 1.1 Confirm the mcp-development OAuth consent fix (approval password) has merged, and note its commit SHA. Verify by reading `shared/oauth2-authorization-server.js` on mcp-development `main` and finding the approval-password check. Do not proceed to group 5 without it
- [ ] 1.2 Add dependencies `express`, `better-sqlite3`, `@modelcontextprotocol/sdk`, `zod` with `npm install`, and verify `npm ci && npm test` still passes on the template smoke test
- [ ] 1.3 Create the module layout (`src/domain/`, `src/store.js`, `src/flatnotes.js`, `src/mcp.js`, `src/app.js`, `src/seed/`, `src/vendor/`) and verify `npm run lint` passes

## 2. Domain helpers (pure)

- [ ] 2.1 Implement `isMonday`, `weekOf(date)`, `weekDates(weekStart)` and `resolveWeek(spec, now)` for current, next and previous in Europe/Zurich. Verify with unit tests covering Sunday 20:00 local and the 23:30Z Sunday-to-Monday boundary
- [ ] 2.2 Implement `validatePlan(weekStart, days)`: Monday check with nearest-Monday hint, YYYY-MM-DD format, days inside the week, no duplicate dates. Verify with unit tests for each rejection message
- [ ] 2.3 Implement `dinnerSummary(days, maxLen)` and verify with unit tests for ordering and truncation
- [ ] 2.4 Implement `pickUndoTarget(historyRows)` (newest non-undo entry not referenced by any `undoes_id`). Verify unit tests for: single undo, two undos stepping back twice, undo never reversing an undo, and nothing to undo

## 3. Store

- [ ] 3.1 Create the schema (`week`, `day`, `history` with `undoes_id`) with a `user_version` check. Verify a test that opens an in-memory db and inspects `PRAGMA table_info`
- [ ] 3.2 Implement `saveWeek` (create or replace, status "data") and `updateDay`, each in one transaction with its history row. Verify tests for overwrite, partial week, updating a day in a missing week, and history before/after JSON
- [ ] 3.3 Implement `getWeek` (7 days, with empty days filled), `listWeeks(from, to)`, `deleteWeek` and `nextUnplannedMonday(today)`. Verify tests for each spec scenario
- [ ] 3.4 Implement `undoLastChange` using `pickUndoTarget`. It restores `before_json` (deleting the week if null) and appends an `undo` row. Verify tests for undoing a create, an overwrite, a delete, and two undos in a row
- [ ] 3.5 Add `src/seed/weeks.js` with the two brief weeks and seed-on-empty at startup. Verify a test that seeds an empty db once and doesn't re-seed on a second start

## 4. Flatnotes rules

- [ ] 4.1 Implement the read-only Flatnotes client (token then get note, 3 s timeout, titles from env with defaults). Verify unit tests with a stubbed `fetch` for success, missing note, and unreachable host
- [ ] 4.2 Write `docs/seed-flatnotes-rules.md`: a paste-in Claude prompt that creates the 4 notes with the seed content from the brief, with the pantry marked "as of 6 Sep 2026, likely out of date". Verify that each note title matches the client's defaults

## 5. MCP server and auth

- [ ] 5.1 Vendor `oauth2-authorization-server.js` and its test byte-for-byte from the mcp-development commit noted in 1.1, with a source-commit header. Add `npm run test:vendor` (`node --test`), exclude `src/vendor/` from coverage, and verify both test commands pass
- [ ] 5.2 Implement `createMcpServer` with all tools from the planning-mcp spec. Include the "call this first" description on `get_planning_context` and text-plus-JSON results. Verify unit tests that call each tool handler against an in-memory store and stub rules, including the error and "no plan" paths
- [ ] 5.3 Implement the `src/app.js` Express factory (`/health`, OAuth routes, `/mcp` behind `requireAuth`) and `src/index.js` (env validation, refusing to start without `MCP_API_KEY`). Verify tests that start the app on an ephemeral port and check: health 200, `/mcp` 401 with `WWW-Authenticate`, `/mcp` OK with `x-api-key`
- [ ] 5.4 Add `.env.example` entries (`MCP_API_KEY`, `BASE_URL`, `OAUTH_*` including the approval password, `FLATNOTES_URL/USER/PASS`, `MEALS_RULE_NOTE_*`, `MEALS_DB`, `TZ`), and verify `index.js` reads each one
- [ ] 5.5 Run the server locally with MCP Inspector over `x-api-key`. Exercise `get_planning_context`, `save_week_plan`, `get_week_plan("current")`, `update_day` and `undo_last_change` (twice), and record the results in the PR description

## 6. Docs and release

- [ ] 6.1 Write the README sections for this change: what it is, local run, env vars, the tool list, the Flatnotes rule notes, and backup as a known gap. Verify that the documented local-run command works
- [ ] 6.2 Write `docs/how-to-use.md`, the paste-in note for a Claude chat ("Plan the next 2 weeks" → `get_planning_context`, check Cozi, draft, iterate, save; "Save Lisa's plan" from a shared image). Verify that it names only tools that exist
- [ ] 6.3 `npm version minor`, then verify that `npm run lint`, `npm test` (coverage ≥80%) and `npm run test:vendor` all pass

## Workflow follow-up

- Archive this change after its PR merges, before applying `deploy-mcp-to-home-docker`.
