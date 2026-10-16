// Background worker for dish pictures (OpenSpec add-dish-images). Each cycle
// it syncs stored dinners into the dish_image table, then asks the
// food-image service on the desktop for one pending picture at a time and
// saves it under the dish-images directory. The desktop being off is normal:
// that just backs off and retries, without counting against the dish.

import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dishSeed } from "./dish.js";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTEMPTS = 3;
const IDLE_MS = 30_000;
const BACKOFF_MIN_MS = 60_000;
const BACKOFF_MAX_MS = 15 * 60_000;
const REQUEST_TIMEOUT_MS = 6 * 60_000;

export function dishImagePath(dir, key) {
  return join(dir, `${key}.png`);
}

export function createDishImageWorker({
  store,
  config,
  fetch = globalThis.fetch,
  now = () => new Date(),
  log = console.log,
  sleep = (ms, signal) =>
    new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      });
    }),
}) {
  const { url, apiKey, dir, skip, size } = config.dishImages;
  const stamp = () => now().toISOString();

  // One step: returns "idle" (nothing to do), "unavailable" (service down or
  // busy; try later), "done", "retry" or "failed".
  async function runOnce() {
    store.syncDishImages(stamp(), skip);
    const dish = store.nextPendingDish();
    if (!dish) return "idle";

    let response;
    try {
      response = await fetch(`${url}/v1/food-image`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          prompt: dish.dish_text,
          seed: dishSeed(
            dish.key,
            dish.generation * MAX_ATTEMPTS + dish.attempts,
          ),
          size,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      log(`dish picture: food-image service unreachable (${e.message})`);
      return "unavailable";
    }
    if (response.status === 503) return "unavailable";

    let problem = null;
    if (response.ok) {
      const png = Buffer.from(await response.arrayBuffer());
      if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) problem = "not a PNG";
      else if (png.length > MAX_IMAGE_BYTES) problem = "picture too large";
      else {
        await mkdir(dir, { recursive: true });
        const file = dishImagePath(dir, dish.key);
        const tmp = `${file}.tmp`;
        await writeFile(tmp, png);
        await rename(tmp, file);
        store.updateDish(
          dish.key,
          { status: "done", attempts: dish.attempts },
          stamp(),
        );
        log(`dish picture: done for "${dish.dish_text}"`);
        return "done";
      }
    } else {
      const body = await response.text().catch(() => "");
      problem = `HTTP ${response.status} ${body.slice(0, 200)}`.trim();
    }

    const attempts = dish.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    // A failed redo keeps the old picture: the row stays done, and stops
    // being queued once its attempts run out.
    const redo = dish.redo === 1;
    store.updateDish(
      dish.key,
      {
        status: redo ? "done" : failed ? "failed" : "pending",
        attempts,
        error: problem,
        redo: redo && !failed,
      },
      stamp(),
    );
    log(
      `dish picture: "${dish.dish_text}" ${failed ? "failed" : "will retry"}: ${problem}`,
    );
    return failed ? "failed" : "retry";
  }

  const controller = new AbortController();
  let running = null;

  async function loop() {
    let backoff = BACKOFF_MIN_MS;
    while (!controller.signal.aborted) {
      let outcome;
      try {
        outcome = await runOnce();
      } catch (e) {
        log(`dish picture: worker error: ${e.message}`);
        outcome = "unavailable";
      }
      if (outcome === "unavailable") {
        await sleep(backoff, controller.signal);
        backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
        continue;
      }
      backoff = BACKOFF_MIN_MS;
      if (outcome === "idle") await sleep(IDLE_MS, controller.signal);
    }
  }

  return {
    runOnce,
    start() {
      running ??= loop();
      return running;
    },
    async stop() {
      controller.abort();
      await running;
    },
  };
}
