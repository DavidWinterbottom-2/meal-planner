# Tasks

## 0. Decisions (David)

- [x] 0.1 How the Pi reaches ComfyUI. **Decided:** a standard food-image pipeline service beside ComfyUI (design decision 1)
- [x] 0.2 Style. **Decided:** photo-realistic
- [ ] 0.3 Confirm the skip list (default: out, IKEA, restaurant, takeaway, leftovers, use-it-up, Kita)

## 1. Library and queue

- [x] 1.1 `dish_image` table, `normalise`/`dishKey`, skip list (`src/images/`). Verify unit tests for normalisation, keys and skip patterns. **Done:** migration 2, `src/images/dish.js`, 12 tests
- [x] 1.2 Enqueue on `save_week_plan` and `update_day` after commit, plus an idempotent startup backfill. Verify store tests. **Done, simpler than planned:** no hooks in the MCP tools. Each worker cycle runs `syncDishImages()`, which gives every distinct stored dinner a row, so saves, day updates, undo and the backfill all go through one idempotent pass

## 2. Food-image service (sidecar-containers)

- [ ] 2.0 Add `food-image/`: `POST /v1/food-image`, the fixed txt2img workflow template (checkpoint, `FOOD_STYLE`, negative prompt), API key, prompt validation, a one-at-a-time queue, a timeout and `503` while ComfyUI is down; `VERSION`, `.bumpversion.toml`, a build workflow, README and SIDECAR.md. Verify tests against a fake ComfyUI, and a real generation on the desktop

## 3. Generator (meal planner)

- [x] 3.1 Build the food-image client and the worker loop with backoff, attempts, a timeout and PNG validation. Verify tests against a fake service: success, unreachable then recovered, `503`, error to `failed`, timeout, bad payload. **Done:** `src/images/worker.js`; each retry uses a new seed; tests cover every path, including the loop's backoff and a crash inside a cycle
- [x] 3.2 Config: `FOOD_IMAGE_URL` and `FOOD_IMAGE_API_KEY`; off when the URL is unset. **Done:** plus `DISH_IMAGES_DIR` (default next to the database) and `DISH_IMAGE_SKIP`; the worker starts in `server.js` only when the URL is set. Verify a config test, and that CI and e2e need no GPU

## 4. Viewer and MCP

- [x] 4.1 Add `/dish-images/:key.png` on the viewer listener (key regex, immutable caching, `?v=` busting), the thumbnail in the day row, and service-worker caching. Verify route, render and sw tests. **Done:** route, render and sw tests, and a phone screenshot against a fake service. No e2e: CI runs the image without `FOOD_IMAGE_URL`, so pictures are off there
- [x] 4.2 Add the `regenerate_dish_image` MCP tool. Verify an MCP test. **Done:** only offered when pictures are on; refuses skipped dinners

## 5. Deploy

- [ ] 5.1 docker-infra: the `food-image` service in `desktop-docker/comfyui`, published on the Tailscale address only, with its `.env.example`; `FOOD_IMAGE_*` in meal-planner's compose and `.env.example`. Verify the docker-infra checks pass
- [ ] 5.2 Find the checkpoint name on the desktop and set the Pi `.env`. Verify that this week's dinners get pictures within minutes, and judge the style on the phone
- [ ] 5.3 README, walkthrough and `npm version minor`. Verify lint and tests (≥80%)
