# Design

## Context

This is a greenfield repo rendered from the devcontainer-sandbox copier template: Node 22, ES modules, vitest with an 80% coverage gate, ESLint and Prettier. The deployment precedent is `flatnotes-mcp` / `chores-mcp` in `mcp-development`. Each is an Express host with the shared OAuth2 module (`installOAuth2AuthorizationServer`) and an `x-api-key` gate, behind the Pi's Apache at `mcp.winterbottom.xyz/<name>/`. Unlike those, this app owns its own data rather than wrapping another service's API.

The grill-me session (2026-10-08) settled the decisions below. They override the original brief:

| Topic         | Decision                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Hosting       | One container on the Pi; viewer at `meals.winterbottom.xyz`, MCP at `mcp.winterbottom.xyz/meals/mcp`   |
| Web auth      | Entra via the `entra-auth-proxy` sidecar (`entra-proxy`), David only, 1-year session (add-week-viewer) |
| Rules         | 4 Flatnotes notes, read-only here; `rules` table dropped                                               |
| Clashes       | One plan per week; save overwrites with no warning                                                     |
| Undo          | Append-only history plus `undo_last_change`                                                            |
| Kita          | Claude writes it; no auto-fill                                                                         |
| Current week  | Strictly Mon–Sun, Europe/Zurich                                                                        |
| Sharing       | PNG image, no public links; `get_week_links` dropped                                                   |
| Lisa's images | Route 1 (Claude transcribes from chat) now; upload route gated on a spike                              |
| Backup        | Deferred                                                                                               |

## Goals / Non-Goals

**Goals:**

- Keep the domain logic (dates, validation, undo selection, summaries) in pure exported functions, unit-tested without SQLite or HTTP.
- Make the store the single write path, so history and undo can't be bypassed.
- Make the app factory injectable (db path, clock, Flatnotes client), so tests run in memory with a fixed "today".

**Non-Goals:**

- Concurrency control beyond SQLite's own: there is one user, and writes are serialised by better-sqlite3's synchronous API.
- Schema migrations tooling. A `user_version` pragma check is enough for v1.

## Decisions

**Module layout.**

- `src/domain/`: pure helpers (`weekOf`, `resolveWeek`, `validatePlan`, `dinnerSummary`, `pickUndoTarget`).
- `src/store.js`: better-sqlite3 behind a small API; every write runs in one transaction with its history row.
- `src/flatnotes.js`: a read-only client.
- `src/mcp.js`: `createMcpServer(store, rules, clock)`.
- `src/app.js`: the Express factory.
- `src/index.js`: env and listen.

_Alternative:_ the mcp-development `server.js`/`index.js` split. It's rejected because this app will also host the viewer, and a domain/store seam keeps both surfaces thin.

**better-sqlite3 over node:sqlite.** It is mature, synchronous (a simple transaction model) and ships prebuilt arm64 binaries. _Alternative:_ `node:sqlite` is still experimental in Node 22.

**History and undo are append-only, using an `undoes_id` link.** The history table has `id, week_start, kind (create|replace|update_day|delete|undo), before_json, after_json, undoes_id, at`. To pick the undo target, take the newest non-undo entry whose id no undo entry references. Undo writes `before_json` back, together with a new `undo` row, in one transaction. _Alternative:_ an `undone` flag on the original row. Rejected, because it mutates history, which the spec forbids.

**Full week snapshots in history,** not field diffs. Weeks are tiny (7 short rows), and snapshots make undo a plain restore.

**Week resolution via `Intl.DateTimeFormat` with `timeZone: 'Europe/Zurich'`** on an injected clock. Dates are handled as YYYY-MM-DD strings, so no Date arithmetic crosses a DST boundary. _Alternative:_ a date library. That's an unnecessary dependency for Monday arithmetic.

**Flatnotes rules client.**

- It reuses flatnotes-mcp's approach: `POST /api/token` with user and password, then `GET /api/notes/<title>`.
- Note titles come from env, with these defaults: `Meals - Household`, `Meals - Meal Bank`, `Meals - Recipes`, `Meals - Pantry`.
- It uses a 3 s timeout. A failure returns `{section: null, error}` per note, and the bundle carries a human-readable `rules_status`.
- Results are not cached: planning is rare, and fresh rules matter more.

**OAuth: vendor the shared module only after it is fixed.**

- `src/vendor/oauth2-authorization-server.js` is copied byte-for-byte from `mcp-development/shared/` at the commit that adds the approval password.
- The vendored copy is excluded from vitest coverage. Its own `node:test` file runs through `npm run test:vendor`, which CI also runs.
- _Alternative:_ a fresh implementation. Rejected, because it would be a third OAuth server to keep secure.

**Seeding.** `src/seed/weeks.js` holds the two brief weeks as data. Seeding runs at startup only when `SELECT count(*) FROM week` is 0, and is written through the store, so it appears in history as `create`.

**Tool results.** Each tool returns a short human-readable text block, followed by the JSON payload, so Claude gets both. Validation failures return `isError: true` with the message.

## Risks / Trade-offs

- [The OAuth fix hasn't merged when this change is applied] → Task 1.1 blocks on it. Until then, use `x-api-key` only (Claude Code or MCP Inspector) and don't expose the connector to claude.ai.
- [The vendored OAuth copy drifts from mcp-development] → Record the source commit in a header comment. The mcp-development sync check doesn't cover this repo, so the README notes a manual re-copy on OAuth changes.
- [Rules unavailable, so Claude plans without constraints] → `rules_status` is explicit, and the tool description tells Claude to fetch the notes with the Flatnotes connector when they're missing.
- [better-sqlite3 needs a native build on arm64] → It ships prebuilt binaries for linux-arm64. Use a multi-stage Dockerfile with build tools as a fallback (deploy change).
- [Overwrite with no warning] → Accepted; undo covers it.

## Migration Plan

Greenfield. The database file is created on first start at `MEALS_DB` (default `/data/meals.db`), and the two weeks are seeded. Rollback means stopping the container; the data file persists.
