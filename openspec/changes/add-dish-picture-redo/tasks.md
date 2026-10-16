# Tasks

## 1. Store and worker

- [x] 1.1 Migration 4: `redo` and `generation` columns on `dish_image`. `regenerateDish` sets `redo = 1` for a done dish (else `pending`), resets attempts and bumps `generation`, and does nothing if a redo is already waiting; `nextPendingDish` includes redos. Verify store tests: redo of a done dish keeps it done, redo of a failed dish queues it, a second press doesn't bump generation, and migration from version 3
- [x] 1.2 Worker: seed from `generation * MAX_ATTEMPTS + attempts`; redo success clears `redo`; a redo retry or final failure keeps `done`. Verify worker tests for each path and distinct seeds across generations

## 2. Viewer

- [x] 2.1 Link each dinner picture to `/dish/<key>?week=<monday>`. Verify a render test
- [x] 2.2 `GET /dish/:key` (large picture, dinner text, New picture button or "on its way", back link) and `POST /dish/:key/redo` (same-origin check, 303). Verify route tests: 404 for unknown or unfinished keys, 403 cross-site, queued after a press, idempotent second press
- [x] 2.3 Styles through tokens only; no horizontal scroll at 390px. Verify at 390px in both themes (the seeded e2e data has no finished pictures, so this is a local Playwright click-through with screenshots)

## 3. MCP, docs and release

- [x] 3.1 Update the `regenerate_dish_image` description (old picture kept until the new one is ready). Verify the tool test
- [ ] 3.2 README / `docs/how-to-use.md`: tapping a picture. `npm version minor`; verify lint, tests (≥80%) and e2e
