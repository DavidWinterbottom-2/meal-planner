# Tasks

## 2. Storage and sanitising

- [ ] 2.0 Close the flat-network gap before adding writes (accepted for v1 only; see `deploy-mcp-to-home-docker` design): put the app and the `entra-auth-proxy` sidecar on a private compose network and bind the viewer listener only on it. Verify from another container on `docker-infra` that `meal-planner:3001` doesn't answer, and that the viewer still works through the sidecar. **Code done:** `VIEWER_HOST` here, the private network in docker-infra; the on-Pi check waits for `make start`

- [ ] 2.1 Add `sharp` and `multer`. Verify `npm ci` on linux-arm64 (CI QEMU) installs the prebuilt sharp. **Added**; the arm64 check is the image smoke test (an upload through sharp)
- [x] 2.2 Add the `image` table and a nullable `image_id` column on `week`, as a new step in the store's `MIGRATIONS` (never edit step 1). Because the reference is a week column, `writeSnapshot`/`snapshot` carry it and history snapshots include it with no extra table to restore; add it to `normalizeSnapshot` defaulting to `null`, which is correct for snapshots written before images existed (undo is LIFO, so such a snapshot predates any upload). Verify migration and unit tests covering undo of upload-create and upload-replace, and undo of a pre-image snapshot **Done:** migration 3, `attachImage`, store tests for create/replace/undo and a pre-image snapshot. Uploads are recorded as `create`/`replace` (the history CHECK can't gain a kind)
- [x] 2.3 Implement `sanitiseImage(buffer)` (rotate, strip metadata, ≤2000px, JPEG q85) and type/size validation by magic bytes. Verify unit tests: GPS EXIF is gone, dimensions are capped, a PDF is rejected, an oversize file is rejected **Done:** `src/images/plan-image.js`; GPS EXIF removed, 2000px cap, PDF/HEIC/broken rejected. HEIC is refused (prebuilt sharp can't decode it)
- [x] 2.4 Implement `attachImage(weekStart, file)` (creating an `image_only` week with source Lisa, or attaching to an existing week; replace semantics; file and row ordering) and the orphan sweep. Verify store tests for each plan-images upload scenario **Done:** plus `sweepOrphanImages` at startup (files without a row, older than 30 days)

## 3. Upload page and viewer

- [x] 3.1 Add `GET/POST /upload` (viewer listener behind the login sidecar, Origin check, default to the next unplanned Monday, `?week=` preselect). Verify route tests for the default week, preselection, rejection messages, and a cross-origin POST getting 403 **Done:** `Sec-Fetch-Site`/`Origin` check, multer in memory, 413 over 15 MB, 303 to the week
- [x] 3.2 Serve images at an authenticated route, show `image_only` weeks full width with tap to zoom, and the "Lisa's original" disclosure on data weeks. Add the "Upload Lisa's plan" link to the empty state. Verify `buildWeekView` unit tests and route tests (an image needs login) **Done:** `/plan-images/<id>.jpg` (known ids only, behind the login), full width with tap to open, the disclosure, the empty-state link, and an Upload link in the header
- [ ] 3.3 Phone check: upload from the iPhone camera roll and from Android, then view and zoom. Verify that the outcome is recorded in the PR

## 4. Transcription

- [ ] 4.1 Check that `save_week_plan` on a week with an image keeps the image and sets status "data". Verify a store or tool test (**done**: transcribing keeps the image), and in claude.ai: upload an image-only week, share the same image into Claude, transcribe and save, then see the data plus "Lisa's original" in the viewer

## 5. Docs and release

- [ ] 5.1 Update the README (both routes for Lisa's plans, upload steps) and `docs/how-to-use.md`. Verify that the steps match 3.3 and 4.1
- [ ] 5.2 `npm version minor`, then verify that `npm run lint`, `npm test` (≥80%) and the arm64 build pass

## Workflow follow-up

- Archive after deploy.
- Follow-up change (not started): return the stored image to Claude in `get_week_plan` as MCP image content, gated by the original spike (a flag-guarded `spike_image_echo` tool checked in claude.ai web, iOS and Android).
