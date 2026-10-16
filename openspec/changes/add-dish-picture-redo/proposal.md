# Proposal

## Why

David sometimes dislikes a dish picture. The only way to replace one today is asking Claude to call `regenerate_dish_image`, which needs a chat and a working connector. Two problems with what that does:

- The old picture disappears as soon as the redo is queued, so with the desktop off the dinner shows no picture for hours.
- The redo resets the attempt count, and the picture's seed comes from that count, so the "new" picture is usually the same picture again.

## What Changes

- Tapping a dinner's picture in the viewer opens a dish page: the picture large, the dinner text, and a **New picture** button. A link goes back to the week.
- **New picture** queues a new picture for that dish. The old one stays shown, on the dish page and in the week, until the new one is ready; a failed redo keeps the old one. While a redo is waiting, the page says so, and pressing again doesn't queue a second one.
- Every redo uses a new seed, so each redo gives a different picture. This applies to Claude's `regenerate_dish_image` too, which also keeps the old picture until the new one arrives.

## Non-goals

- Long-press gestures. On the iPhone, long-press already opens the system menu for pictures.
- Choosing between several candidates, or editing the prompt from the viewer. Rewording the dinner (or asking Claude) changes the prompt.
- Pictures for lunch and snacks in the viewer (they appear only in the share picture today).
- Undoing a redo.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dish-images`: redo from the viewer, and a redo keeps the old picture and uses a new seed.

## Impact

- A store migration adds two columns to `dish_image`.
- The viewer gains `GET /dish/:key` and `POST /dish/:key/redo` (behind the login; the POST gets the same same-origin check as uploads).
- The worker picks up redo requests and, for them, keeps the old picture on failure.
- The `regenerate_dish_image` description changes ("kept until the new one is ready").
