# Design

## Decisions for David

1. **How the Pi reaches ComfyUI.** ComfyUI has no login of its own. Today it is reachable only through `comfyui-auth` (oauth2-proxy, Entra), which needs a browser sign-in.
   - **(a) Recommended:** publish ComfyUI's raw API on the desktop's **Tailscale address only** (`100.107.22.70:8189`, not the LAN), so only devices on your tailnet can reach it. The meal planner calls it at `http://desktop-home:8189`. The trade-off: anything on the tailnet can drive ComfyUI without signing in. The tailnet is only your devices, which is the same trust level as the other internal tools.
   - **(b)** Run a small worker container on the desktop, next to ComfyUI on its private network. It pulls pending dishes from the meal planner and pushes pictures back through an authenticated API. ComfyUI stays unexposed, but this adds a second deployable, an API key, and a public write endpoint on the meal planner.
2. **Style.** Default: a **flat, friendly food illustration** in a consistent style, similar to Lisa's plans and clearly not a photo. The other option is photo-realistic. A generated "photo" of your Älplermagronen that doesn't look like yours tends to jar more than an illustration does. The style lives in `DISH_IMAGE_STYLE`, so you can change it later and regenerate.
3. **Skip list.** Dinners matching `out`, `ikea`, `restaurant`, `takeaway`, `leftover`, `use-it-up`, `kita` or `—` (case-insensitive) get no picture. The list lives in config.

## Dish key

`normalise(dinner)`: lower-case, `&` to "and", punctuation and `+` to spaces, whitespace collapsed, trimmed. `key = sha256(normalised).slice(0, 16)`. "Sausages, roast vegetables & corn" and "sausages roast vegetables and corn" share a picture, while "Sausages + mash + peas/broccoli" gets its own. We don't try to match against the meal bank: plan wording varies too much to match reliably, and an extra picture per variant costs a few seconds of GPU time.

## Storage

The `dish_image` table holds `key PK, dish_text, status (pending|done|failed|skipped), attempts, error, created_at, updated_at`. Files are `/data/dish-images/<key>.png`, written to a temporary file and then renamed into place. `regenerate` deletes the file and resets the row to `pending`.

## Generation

- **Enqueue:** `save_week_plan` and `update_day` call `enqueueDinners(days)` after their transaction commits. Each new key is added as `pending`, or as `skipped` if it matches the skip list. Startup also enqueues every stored dinner (the backfill), which is idempotent.
- **Worker:** a single in-process loop takes one `pending` row at a time:
  1. POST `/prompt` with a fixed txt2img workflow, committed as `src/images/workflow.json`. Placeholders are filled in for the checkpoint, the prompt (`DISH_IMAGE_STYLE` + dish text), a negative prompt (text, letters, hands) and the seed (from the key, so results are reproducible).
  2. Poll `/history/<id>` until done.
  3. GET `/view?filename=…`.
  4. Validate the PNG signature and a size of 5 MB or less, then save the file.
- **Failures:** an unreachable ComfyUI means waiting (backoff from 1 minute up to 15 minutes) without counting an attempt. A ComfyUI error counts as an attempt, and after 3 attempts the row is marked `failed` (visible via MCP; `regenerate` resets it). There is a 3-minute timeout per picture.
- **Config:** with `COMFYUI_URL` unset the worker doesn't start and nothing is queued. The feature is off by default, so CI and local runs need no GPU.

## Viewer

- `GET /dish-images/:key.png` on the viewer listener only, behind the sidecar like every page. `key` must match `^[0-9a-f]{16}$`, and the file is only ever read from the images directory. Served with `Cache-Control: max-age=2592000, immutable`; regenerating gives a new URL (`?v=<updated_at>`).
- The day row shows a 72px rounded thumbnail to the right of the dinner, but only when its status is `done`, with `alt` set to the dinner text and `loading="lazy"`. No picture means no placeholder.
- The service worker treats `/dish-images/` as a cache-first asset, so pictures show offline.
- CSP is unchanged: `img-src 'self'`.

## MCP

`regenerate_dish_image(dinner)` normalises the text, resets the picture to `pending` and returns the status. `get_week_plan` doesn't change; pictures are for people.

## Testing

- Unit tests: `normalise`/`key`, the skip list, enqueue on save and update, and the backfill being idempotent.
- The worker against a fake ComfyUI (a local Express app copying `/prompt`, `/history` and `/view`): success, unreachable-then-recovers, error then `failed`, a timeout, and an oversized or non-PNG response being rejected.
- Route tests: the key regex, 404 for unknown keys, and nothing served on the MCP listener.
- Render test: a thumbnail only when `done`.
- e2e: a seeded `done` image shows on the day row.
