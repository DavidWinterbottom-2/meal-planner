# Tasks

## 1. Spike: do tool-returned images reach Claude? (gate)

- [ ] 1.1 Add the flag-guarded `spike_image_echo` tool returning a fixture PNG committed under `test/fixtures/` (a photographed sample plan, no dependency on `add-week-png-share`) as MCP image content. Run this as soon as `deploy-mcp-to-home-docker` is live. Verify a unit test that the tool exists only when `SPIKE_IMAGE_TOOL=true`, then deploy with the flag on
- [ ] 1.2 In claude.ai web, the iOS app and the Android app, ask Claude to call `spike_image_echo` and read Thursday's dinner. Verify by recording each client's answer in `docs/spikes/mcp-image-content.md`. **If any client fails, stop here:** update the README to "route 1 only", remove the tool, and delete this change
- [ ] 1.3 Remove `spike_image_echo` and the flag. Verify the tool list no longer contains it

## 2. Storage and sanitising

- [ ] 2.0 Close the flat-network gap before adding writes (accepted for v1 only; see `deploy-mcp-to-home-docker` design): put the app and the `entra-auth-proxy` sidecar on a private compose network and bind the viewer listener only on it. Verify from another container on `docker-infra` that `meal-planner:3001` doesn't answer, and that the viewer still works through the sidecar

- [ ] 2.1 Add `sharp` and `multer`. Verify `npm ci` on linux-arm64 (CI QEMU) installs the prebuilt sharp
- [ ] 2.2 Add the `image` table and a nullable `image_id` column on `week`, as a new step in the store's `MIGRATIONS` (never edit step 1). Because the reference is a week column, `writeSnapshot`/`snapshot` carry it and history snapshots include it with no extra table to restore; add it to `normalizeSnapshot` defaulting to `null`, which is correct for snapshots written before images existed (undo is LIFO, so such a snapshot predates any upload). Verify migration and unit tests covering undo of upload-create and upload-replace, and undo of a pre-image snapshot
- [ ] 2.3 Implement `sanitiseImage(buffer)` (rotate, strip metadata, ≤2000px, JPEG q85) and type/size validation by magic bytes. Verify unit tests: GPS EXIF is gone, dimensions are capped, a PDF is rejected, an oversize file is rejected
- [ ] 2.4 Implement `attachImage(weekStart, file)` (creating an `image_only` week with source Lisa, or attaching to an existing week; replace semantics; file and row ordering) and the orphan sweep. Verify store tests for each plan-images upload scenario

## 3. Upload page and viewer

- [ ] 3.1 Add `GET/POST /upload` (viewer listener behind the login sidecar, Origin check, default to the next unplanned Monday, `?week=` preselect). Verify route tests for the default week, preselection, rejection messages, and a cross-origin POST getting 403
- [ ] 3.2 Serve images at an authenticated route, show `image_only` weeks full width with tap to zoom, and the "Lisa's original" disclosure on data weeks. Add the "Upload Lisa's plan" link to the empty state. Verify `buildWeekView` unit tests and route tests (an image needs login)
- [ ] 3.3 Phone check: upload from the iPhone camera roll and from Android, then view and zoom. Verify that the outcome is recorded in the PR

## 4. MCP

- [ ] 4.1 Extend `get_week_plan` to return the image (≤1568px long edge, base64, MIME) plus a "needs transcribing" note for `image_only` weeks, and check that `save_week_plan` keeps the image and sets status "data". Verify unit tests on the tool handlers
- [ ] 4.2 MCP Inspector and claude.ai check: upload an image-only week, ask Claude to plan (the flag shows up in `get_planning_context`), transcribe it, and save. Verify the week shows data plus "Lisa's original" in the viewer

## 5. Docs and release

- [ ] 5.1 Update the README (both routes for Lisa's plans, upload steps, the spike outcome) and `docs/how-to-use.md`. Verify that the steps match 3.3 and 4.2
- [ ] 5.2 `npm version minor`, then verify that `npm run lint`, `npm test` (≥80%) and the arm64 build pass

## Workflow follow-up

- Archive after deploy. If the spike failed, delete the change instead and note the decision in the README.
