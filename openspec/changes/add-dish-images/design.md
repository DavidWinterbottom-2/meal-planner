# Design

## Decisions for David

1. **How the Pi reaches ComfyUI: a standard food-image pipeline (decided).** ComfyUI has no login and sits behind `comfyui-auth` (Entra, browser only). Rather than expose its raw API (any workflow, any custom node), a small **food-image service** runs beside it on the desktop, on ComfyUI's private Docker network. It is a new image in `sidecar-containers`, deployed in `desktop-docker/comfyui`. It offers one narrow, reusable endpoint:

   `POST /v1/food-image` with body `{ "prompt": "rack of lamb, potatoes, broccoli", "seed": 123, "size": 512 }` and header `x-api-key`. The response is `image/png`, or `503` if ComfyUI isn't ready.

   - The service owns the **one fixed txt2img workflow**: checkpoint, sampler, the house style (`FOOD_STYLE`) and the negative prompt. Callers send only the food description, so they can't run arbitrary workflows.
   - It is published on the desktop's **Tailscale address only** (`desktop-home:8190`) and requires an API key. The meal planner (`FOOD_IMAGE_URL`, `FOOD_IMAGE_API_KEY`) is its first client. Others can follow, for example nutrition-tracker or recipe notes.
   - The prompt is limited to 300 characters of plain text. The service handles one generation at a time (it queues) and times out after 3 minutes.

2. **Style.**2. **Style.** Default: a **flat, friendly food illustration** in a consistent style, similar to Lisa's plans and clearly not a photo. The other option is photo-realistic. A generated "photo" of your Älplermagronen that doesn't look like yours tends to jar more than an illustration does. The style lives in `DISH_IMAGE_STYLE`, so you can change it later and regenerate.
3. **Skip list.** Dinners matching `out`, `ikea`, `restaurant`, `takeaway`, `leftover`, `use-it-up`, `kita` or `—` (case-insensitive) get no picture. The list lives in config.

## Dish key

`normalise(dinner)`: lower-case, `&` to "and", punctuation and `+` to spaces, whitespace collapsed, trimmed. `key = sha256(normalised).slice(0, 16)`. "Sausages, roast vegetables & corn" and "sausages roast vegetables and corn" share a picture, while "Sausages + mash + peas/broccoli" gets its own. We don't try to match against the meal bank: plan wording varies too much to match reliably, and an extra picture per variant costs a few seconds of GPU time.

## Storage

The `dish_image` table holds `key PK, dish_text, status (pending|done|failed|skipped), attempts, error, created_at, updated_at`. Files are `/data/dish-images/<key>.png`, written to a temporary file and then renamed into place. `regenerate` deletes the file and resets the row to `pending`.

## Generation (meal planner side)

- **Enqueue:** `save_week_plan` and `update_day` call `enqueueDinners(days)` after their transaction commits. Each new key is added as `pending`, or as `skipped` if it matches the skip list. Startup also enqueues every stored dinner (the backfill), which is idempotent.
- **Worker:** a single in-process loop takes one `pending` row at a time:
  1. POST `/v1/food-image` with the dish text and a seed derived from the key, so results are reproducible.
  2. Validate the PNG signature and a size of 5 MB or less, then save the file.

  The workflow, checkpoint and style all live in the food-image service, not here.

- **Failures:** an unreachable service (or a `503`) means waiting (backoff from 1 minute up to 15 minutes) without counting an attempt. Any other error counts as an attempt, and after 3 attempts the row is marked `failed` (visible via MCP; `regenerate` resets it). There is a 3-minute timeout per picture.
- **Config:** with `FOOD_IMAGE_URL` unset the worker doesn't start and nothing is queued. The feature is off by default, so CI and local runs need no GPU.

## Viewer

- `GET /dish-images/:key.png` on the viewer listener only, behind the sidecar like every page. `key` must match `^[0-9a-f]{16}$`, and the file is only ever read from the images directory. Served with `Cache-Control: max-age=2592000, immutable`; regenerating gives a new URL (`?v=<updated_at>`).
- The day row shows a 72px rounded thumbnail to the right of the dinner, but only when its status is `done`, with `alt` set to the dinner text and `loading="lazy"`. No picture means no placeholder.
- The service worker treats `/dish-images/` as a cache-first asset, so pictures show offline.
- CSP is unchanged: `img-src 'self'`.

## MCP

`regenerate_dish_image(dinner)` normalises the text, resets the picture to `pending` and returns the status. `get_week_plan` doesn't change; pictures are for people.

## Testing

- Unit tests: `normalise`/`key`, the skip list, enqueue on save and update, and the backfill being idempotent.
- The worker against a fake food-image service: success, unreachable-then-recovers, `503`, error then `failed`, a timeout, and an oversized or non-PNG response being rejected.
- The food-image service, in its own repo: the workflow template is filled correctly, the prompt is validated, the API key is enforced, and it runs against a fake ComfyUI (`/prompt`, `/history`, `/view`).
- Route tests: the key regex, 404 for unknown keys, and nothing served on the MCP listener.
- Render test: a thumbnail only when `done`.
- e2e: a seeded `done` image shows on the day row.
