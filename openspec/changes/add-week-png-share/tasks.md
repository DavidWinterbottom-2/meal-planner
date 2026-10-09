# Tasks

## 1. Rendering

- [ ] 1.1 Add `satori`, `@resvg/resvg-js` and a bundled open-licence font (regular and bold) under `assets/fonts/` with its licence file. Verify `npm ci` on linux-arm64 (CI QEMU) installs the prebuilt resvg binary
- [ ] 1.2 Implement `buildImageTree(view)`: columns Day | Lunch | Snacks | Dinner | Notes, Kita label, combined snacks, heading, source, prep, ≥1080px width. Verify unit tests asserting the tree for the seeded 2026-10-12 week (7 rows, Kita text, snack merge)
- [ ] 1.3 Implement `renderWeekPng(view)` (satori then resvg). Verify a test that decodes the PNG header (width ≥1080), plus a long-dinner case that comes out taller than the baseline, plus umlauts rendering without missing glyphs (visual check of the snapshot attached to the PR)

## 2. Route and cache

- [ ] 2.1 Add `GET /week/:date.png` on the viewer listener (behind the login sidecar), returning 404 for unplanned weeks, with an LRU keyed `week_start:updated_at`. Verify route tests: 200 `image/png`, 404, the route absent on the MCP listener, and new output after `update_day`
- [ ] 2.2 Measure the render time on the Pi for the seeded week. Verify it's under 1 s cold and near-instant cached, recorded in the PR

## 3. Share control

- [ ] 3.1 Add the Share button to planned weeks only, with the Web Share API (files) and an `<a download="meals-YYYY-MM-DD.png">` fallback. Verify a unit test of the share-or-download decision with a stubbed `navigator`, and a manual check on iPhone and Android that the PNG reaches WhatsApp
- [ ] 3.2 Update the README (sharing to WhatsApp). Verify that the steps match the phone check

## 4. Release

- [ ] 4.1 `npm version minor`, then verify that `npm run lint`, `npm test` (≥80%) and the arm64 image build pass

## Workflow follow-up

- Archive after deploy and the WhatsApp check.
