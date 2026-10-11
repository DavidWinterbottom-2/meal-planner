# Proposal

## Why

The viewer is text only. A picture beside each dinner makes the week readable at a glance, and Thomas can point at what's for tea. Lisa's plans already come with food pictures, but they are small illustrations baked into one image, and her next plan may look different. So we generate our own, one per dish, with the ComfyUI GPU host that is otherwise mostly idle. The desktop is on most of the time, so a new dish gets its picture within minutes.

## What Changes

- **A dish picture library.** Each distinct dinner (normalised text, e.g. "Rack of lamb + potatoes + broccoli") gets one generated picture, stored on the meal planner's data volume and reused whenever that dinner comes up again.
- **Generation in the background.** When a week is saved or a day is updated, its dinners with no picture yet are queued. A loop in the meal-planner process sends each one to ComfyUI and saves the result. If ComfyUI is unreachable (desktop off), the queue waits and retries; nothing else is affected. Existing weeks are backfilled once.
- **Non-cooked dinners are skipped:** eating out, "Kita", leftovers and use-it-up nights, by a small, editable list of patterns.
- **The viewer shows the picture** beside each day's dinner. Pictures are served behind the viewer login and saved for offline use like the rest of the page.
- **An MCP tool `regenerate_dish_image`** lets Claude throw away a bad picture and queue a new one ("the lamb picture looks like a cake, redo it").
- **docker-infra:** the meal planner on the Pi needs to reach ComfyUI's API. Today ComfyUI is reachable only through its Entra sign-in proxy, which a server can't pass. See design.md, decision 1.

## Non-goals

- Real photos or uploads (see `add-lisa-image-upload`).
- Pictures for lunches and snacks.
- Choosing between several candidate pictures per dish.
- Generating on the Pi (no GPU).

## Capabilities

### New Capabilities

- `dish-images`: the per-dish picture library, its generation queue, display in the viewer, and regeneration.

### Modified Capabilities

None. The week page gains a picture element, specified in `dish-images`.

## Impact

- meal-planner: new table `dish_image`, files under `/data/dish-images/`, a background generator, a viewer route `/dish-images/:key.png`, one MCP tool, and new settings `COMFYUI_URL`, `COMFYUI_CHECKPOINT` and `DISH_IMAGE_STYLE`. The feature is off when `COMFYUI_URL` is empty. No new npm dependencies.
- docker-infra (desktop-docker/comfyui): one new port binding (decision 1).
- Disk: about 300 KB per dish at 512×512 PNG, so about 15 MB for 50 dishes.
