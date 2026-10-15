# Tasks

## 1. Store and MCP

- [ ] 1.1 Add the one-row `stock` table as the next step in `MIGRATIONS`, `store.getStock()` and `store.replaceStock(text, at)`, plus the pure, exported `stockAgeDays(updatedAt, today)` in the household timezone. Verify store tests (never saved, replace, the 4000-character limit) and `stockAgeDays` tests including the Zurich day boundary
- [ ] 1.2 Register `get_stock` and `update_stock(text)` (zod, tool error over 4000 characters). Verify tool tests for each `kitchen-stock` MCP scenario
- [ ] 1.3 Add `stock` to `buildPlanningContext`; drop `pantry` from `RULE_SECTIONS` and `DEFAULT_RULE_TITLES`; add the description line. Verify planning-context tests (3 rule notes, stock included) and a description test

## 2. Viewer

- [ ] 2.1 Add `wb-package` (Lucide `package`, ISC) to `docker-infra/design-system/winterbottom-icons.svg` in its own small PR, then vendor the sprite here unchanged
- [ ] 2.2 Add `GET /stock` and its renderer (escaped text, line breaks kept, "Last updated …" with today/yesterday/N days ago, "Nothing saved yet"), styled through tokens only. Verify renderer unit tests and a route test (viewer listener, `no-store`)
- [ ] 2.3 Add the stock icon button to the header before Upload, with `aria-current` on `/stock`. Verify the header unit test and the e2e one-line-header check at 390px in both themes (apply the brand fallback from design.md if it fails)
- [ ] 2.4 Add `/stock` to the service worker's page matcher and `WARM_PAGES`. Verify `test/web/sw.test.js`

## 3. Docs and release

- [ ] 3.1 Update the README and `docs/how-to-use.md` (where the stock lives, asking Claude to update it, the one-off move) and the `openspec/config.yaml` context line about 4 rule notes
- [ ] 3.2 `npm version minor`, then verify that `npm run lint`, `npm test` (≥80%), e2e and the arm64 image smoke test pass

## 4. After deploy (manual)

- [ ] 4.1 Reconnect the claude.ai connector, then in a chat copy "Meals - Pantry" in with `update_stock` and replace the note body with the pointer. Verify that `/stock` on the phone shows the text and "Last updated … (today)"
- [ ] 4.2 Archive the change
