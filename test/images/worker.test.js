import { describe, test, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../../src/store.js";
import {
  createDishImageWorker,
  dishImagePath,
  MAX_ATTEMPTS,
} from "../../src/images/worker.js";
import { DEFAULT_SKIP, dishKey } from "../../src/images/dish.js";

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("pixels"),
]);
const AT = "2026-10-15T10:00:00.000Z";
const KEY = "k".repeat(40);

function respond(status, body = "") {
  return new Response(body, { status });
}

let store, dir, calls, replies, logs;

function worker(extra = {}) {
  return createDishImageWorker({
    store,
    config: {
      dishImages: {
        url: "http://desktop-home:8190",
        apiKey: KEY,
        dir,
        skip: DEFAULT_SKIP,
        size: 768,
      },
    },
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    now: () => new Date(AT),
    log: (m) => logs.push(m),
    ...extra,
  });
}

beforeEach(() => {
  store = openStore();
  dir = mkdtempSync(join(tmpdir(), "dish-"));
  calls = [];
  replies = [];
  logs = [];
  store.saveWeek(
    {
      week_start: "2026-10-12",
      days: [
        { date: "2026-10-12", dinner: "Fish pie" },
        { date: "2026-10-13", dinner: "Dinner at IKEA" },
      ],
    },
    AT,
  );
});

describe("dish picture worker", () => {
  test("generates the pending dish and saves the PNG", async () => {
    replies.push(respond(200, PNG));
    expect(await worker().runOnce()).toBe("done");
    expect(calls[0].url).toBe("http://desktop-home:8190/v1/food-image");
    expect(calls[0].init.headers["x-api-key"]).toBe(KEY);
    expect(calls[0].body).toMatchObject({ prompt: "Fish pie", size: 768 });
    const key = dishKey("Fish pie");
    expect(readFileSync(dishImagePath(dir, key))).toEqual(PNG);
    expect(store.getDish(key).status).toBe("done");
    // The skipped dinner was never sent; nothing is left to do.
    expect(store.getDish(dishKey("Dinner at IKEA")).status).toBe("skipped");
    expect(await worker().runOnce()).toBe("idle");
    expect(calls).toHaveLength(1);
  });

  test.each([
    ["the service is down", () => new TypeError("fetch failed")],
    ["the service is busy", () => respond(503, "busy")],
  ])("%s: wait without counting an attempt", async (_, reply) => {
    replies.push(reply());
    expect(await worker().runOnce()).toBe("unavailable");
    expect(store.getDish(dishKey("Fish pie"))).toMatchObject({
      status: "pending",
      attempts: 0,
    });
  });

  test.each([
    ["an error", () => respond(502, "ComfyUI failed")],
    ["not a PNG", () => respond(200, "<html>")],
    [
      "an oversized picture",
      () => respond(200, Buffer.concat([PNG, Buffer.alloc(11 * 1024 * 1024)])),
    ],
  ])("%s counts an attempt, and fails after %#", async (_, reply) => {
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      replies.push(reply());
      expect(await worker().runOnce()).toBe(
        i < MAX_ATTEMPTS ? "retry" : "failed",
      );
    }
    const row = store.getDish(dishKey("Fish pie"));
    expect(row).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect(row.error).toBeTruthy();
    // Each retry asks with a different seed.
    expect(new Set(calls.map((c) => c.body.seed)).size).toBe(MAX_ATTEMPTS);
    expect(existsSync(dishImagePath(dir, dishKey("Fish pie")))).toBe(false);
  });

  test("a new dinner from update_day is picked up", async () => {
    replies.push(respond(200, PNG), respond(200, PNG));
    const w = worker();
    expect(await w.runOnce()).toBe("done");
    store.updateDay("2026-10-14", { dinner: "Rack of lamb" }, AT);
    expect(await w.runOnce()).toBe("done");
    expect(calls[1].body.prompt).toBe("Rack of lamb");
  });

  test("the loop backs off while unavailable and stops cleanly", async () => {
    const sleeps = [];
    let w;
    replies.push(
      new TypeError("down"),
      new TypeError("down"),
      respond(200, PNG),
    );
    w = worker({
      sleep: async (ms) => {
        sleeps.push(ms);
        if (sleeps.length >= 3) void w.stop();
      },
    });
    await w.start();
    // 60s, then 120s while down; after the picture is done, the idle wait.
    expect(sleeps).toEqual([60_000, 120_000, 30_000]);
    expect(store.getDish(dishKey("Fish pie")).status).toBe("done");
  });

  test("a crash inside a cycle is logged and backed off, not fatal", async () => {
    let w;
    const sleeps = [];
    w = worker({
      sleep: async (ms) => {
        sleeps.push(ms);
        void w.stop(); // stop() from inside the loop must not await itself
      },
    });
    store.syncDishImages = () => {
      throw new Error("disk full");
    };
    await w.start();
    expect(sleeps).toEqual([60_000]);
    expect(logs.join("\n")).toMatch(/worker error: disk full/);
  });
});

describe("store: dish pictures", () => {
  test("sync adds each distinct dinner once", () => {
    expect(store.syncDishImages(AT)).toBe(2);
    expect(store.syncDishImages(AT)).toBe(0);
    expect(store.nextPendingDish().dish_text).toBe("Fish pie");
  });

  test("regenerate resets a picture, and refuses skipped dinners", () => {
    store.syncDishImages(AT);
    const key = dishKey("Fish pie");
    store.updateDish(key, { status: "failed", attempts: 3, error: "x" }, AT);
    expect(store.regenerateDish(" Fish pie ", AT)).toMatchObject({
      key,
      status: "pending",
      attempts: 0,
      error: null,
    });
    expect(store.regenerateDish("Brand new stew", AT).status).toBe("pending");
    expect(() => store.regenerateDish("Dinner at IKEA", AT)).toThrow(
      /skip list/,
    );
    expect(() => store.regenerateDish("  ", AT)).toThrow(/required/);
  });

  test("dishImages returns rows for known keys only", () => {
    store.syncDishImages(AT);
    const known = dishKey("Fish pie");
    const map = store.dishImages([known, "0000000000000000", known]);
    expect([...map.keys()]).toEqual([known]);
  });
});
