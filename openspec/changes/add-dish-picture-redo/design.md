# Design

## Decisions

### A dish page, not a gesture or a modal

The week's picture becomes a link to `/dish/<key>?week=<monday>`, a server-rendered page like the others: no new script, it works with the existing CSP, and the back link uses the `week` value only after checking it is a Monday date. The button is a plain `<form method="post">` to `/dish/<key>/redo`, answered with 303 back to the page (post/redirect/get, so a reload doesn't resend it).

### Keeping the old picture during a redo

`dish_image.status` can't gain a value without rebuilding the table (SQLite CHECK constraint). Migration 4 adds two columns instead:

- `redo INTEGER NOT NULL DEFAULT 0`: 1 while a redo of a finished picture is waiting. The row stays `done`, so the viewer keeps showing the old file.
- `generation INTEGER NOT NULL DEFAULT 0`: bumped by each redo.

`nextPendingDish` picks `status = 'pending' OR redo = 1`. In the worker, a redo that succeeds writes the new file over the old one (temporary file, then rename, as now) and clears `redo`. A retry keeps the row `done` with `redo = 1`. A final failure clears `redo` and keeps `done`, so the old picture stays. A dish with no finished picture keeps today's path: `pending`, then `done` or `failed`.

### A new seed per redo

The seed is `dishSeed(key, generation * MAX_ATTEMPTS + attempts)`. Redos reset `attempts` to 0 and bump `generation`, so no two generations share a seed. Rows from before the migration have `generation = 0`, which gives exactly today's seeds.

### Pressing twice

`requestRedo` does nothing when `redo = 1` already, so a double tap or a reload doesn't burn another generation.

### Security

Both routes are on the viewer listener only, behind the sidecar login. The POST is refused with 403 unless `isSameOrigin` passes (the upload check). The key must match the 16-hex pattern, and a key without a row is a 404, so the routes can't create rows for arbitrary text.

## Risks / Trade-offs

- A redo costs the desktop one generation (11–60 s of GPU). Single user, idempotent while waiting: acceptable.
- The week page's picture URL changes when a redo is requested (the `?v` comes from `updated_at`), so phones fetch the same old file once more. Harmless.
