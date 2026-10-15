# Tasks

## 1. Store

- [ ] 1.1 Add the `stock` table as the next step in `MIGRATIONS` (never edit earlier steps). Verify a migration test from a database at the previous version
- [ ] 1.2 Add the pure, exported `normaliseStockItems(items)` (trim, drop blanks, case-insensitive de-duplication keeping the first, ≤80 characters, ≤100 items) and `stockAgeDays(updatedAt, today)` in the household timezone, plus `STALE_AFTER_DAYS = 14`. Verify unit tests for each rule, including the Zurich day boundary
- [ ] 1.3 Add `store.replaceStock(section, items, at)` (append a row) and `store.getStock()` (latest row per section; empty and null when never saved). Verify store tests: never saved, replace one section leaves the other, the earlier row is kept, an unknown section is refused

## 2. MCP

- [ ] 2.1 Register `get_stock` and `update_stock(section, items)` with zod inputs and tool errors for invalid input. Verify tool tests for each `kitchen-stock` scenario
- [ ] 2.2 Add `stock` to `buildPlanningContext`; drop `pantry` from `RULE_SECTIONS` and `DEFAULT_RULE_TITLES`; extend the description (refresh stock older than 14 days by asking David, favour freezer items, offer to update the freezer list after saving). Verify planning-context tests (3 rule notes, stock with ages) and a description test

## 3. Viewer

- [ ] 3.1 Add `wb-package` (Lucide `package`, ISC) to `docker-infra/design-system/winterbottom-icons.svg` in its own small PR, then vendor the sprite here unchanged
- [ ] 3.2 Add `GET /stock` and its renderer (Freezer, then Cellar; "updated N days ago", "updated today" or "never updated"; a `.wb-pill--warn` when stale or never updated; an empty section says "Nothing listed"), styled through tokens only. Verify renderer unit tests and a route test (behind the viewer listener, `no-store`)
- [ ] 3.3 Add the stock icon button to the header before Upload, with `aria-current` on `/stock`. Verify the header unit test and the e2e one-line-header check at 390px in both themes (apply the brand fallback from design.md if it fails)
- [ ] 3.4 Add `/stock` to the service worker's page matcher and `WARM_PAGES`. Verify `test/web/sw.test.js` and an e2e offline check of `/stock`

## 4. Docs and release

- [ ] 4.1 Update the README and `docs/how-to-use.md`: where the stock lives, how to ask Claude to update it, and the one-off move from the note. Update the `openspec/config.yaml` context line that says the rules live in 4 notes
- [ ] 4.2 `npm version minor`, then verify that `npm run lint`, `npm test` (≥80%), e2e and the arm64 image smoke test pass

## 5. After deploy (manual)

- [ ] 5.1 Reconnect the claude.ai connector, then in a chat move "Meals - Pantry" into the app with `update_stock`, confirm the result with David, and replace the note body with the pointer. Verify that `/stock` on the phone shows both lists as "updated today"
- [ ] 5.2 Archive the change
