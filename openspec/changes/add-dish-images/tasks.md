# Tasks

## 0. Decisions (David)

- [ ] 0.1 Pick how the Pi reaches ComfyUI (design decision 1: Tailscale-only port, or a worker on the desktop)
- [ ] 0.2 Confirm the style (illustration by default) and the skip list

## 1. Library and queue

- [ ] 1.1 `dish_image` table, `normalise`/`dishKey`, skip list (`src/images/`). Verify unit tests for normalisation, keys and skip patterns
- [ ] 1.2 Enqueue on `save_week_plan` and `update_day` after commit, plus an idempotent startup backfill. Verify store tests

## 2. Generator

- [ ] 2.1 Commit a txt2img `workflow.json`, then build the ComfyUI client (`/prompt`, `/history`, `/view`) and the worker loop with backoff, attempts, a timeout and PNG validation. Verify tests against a fake ComfyUI: success, unreachable then recovered, error to `failed`, timeout, bad payload
- [ ] 2.2 Config: `COMFYUI_URL`, `COMFYUI_CHECKPOINT` and `DISH_IMAGE_STYLE`; off when the URL is unset. Verify a config test, and that CI and e2e need no GPU

## 3. Viewer and MCP

- [ ] 3.1 Add `/dish-images/:key.png` on the viewer listener (key regex, immutable caching, `?v=` busting), the thumbnail in the day row, and service-worker caching. Verify route, render and sw tests, plus e2e with a seeded image
- [ ] 3.2 Add the `regenerate_dish_image` MCP tool. Verify an MCP test

## 4. Deploy

- [ ] 4.1 docker-infra: the ComfyUI reachability change from 0.1, plus `COMFYUI_*` in meal-planner's compose and `.env.example`. Verify the docker-infra checks pass
- [ ] 4.2 Find the checkpoint name on the desktop and set the Pi `.env`. Verify that this week's dinners get pictures within minutes, and judge the style on the phone
- [ ] 4.3 README, walkthrough and `npm version minor`. Verify lint and tests (≥80%)
