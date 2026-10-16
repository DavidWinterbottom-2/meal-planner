import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  contentSecurityPolicy,
  createViewerApp,
  dishThumbnails,
  isSameOrigin,
  MANIFEST,
} from "../src/viewer-app.js";
import { createMcpApp } from "../src/mcp-app.js";
import { readConfig } from "../src/config.js";
import { openStore } from "../src/store.js";
import { seedIfEmpty } from "../src/seed/weeks.js";
import sharp from "sharp";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEY = "k".repeat(64);
let nowValue = new Date("2026-10-15T10:00:00Z"); // Thursday of the 2026-10-12 week
const servers = [];
let viewer, mcp, store;
const planImagesDir = mkdtempSync(join(tmpdir(), "plan-images-"));

function listen(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => {
      servers.push(s);
      resolve(`http://127.0.0.1:${s.address().port}`);
    });
  });
}

beforeAll(async () => {
  store = openStore();
  seedIfEmpty(store, "2026-10-01T00:00:00.000Z");
  const config = readConfig({
    MCP_API_KEY: KEY,
    ANALYTICS_SCRIPT_URL: "https://umami.winterbottom.xyz/script.js",
    ANALYTICS_WEBSITE_ID: "site-1",
    PLAN_IMAGES_DIR: planImagesDir,
  });
  viewer = await listen(
    createViewerApp({ store, config, now: () => nowValue }),
  );
  mcp = await listen(createMcpApp({ store, config, now: () => nowValue }));
});
afterAll(() => {
  servers.forEach((s) => s.close());
  store.close();
  rmSync(planImagesDir, { recursive: true, force: true });
});

const get = (url) => fetch(url, { redirect: "manual" });

describe("week pages", () => {
  test("/ shows the current Zurich week without redirecting", async () => {
    const res = await get(`${viewer}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toMatch(/Mon 12 – Sun 18 Oct/);
    expect(body).toMatch(/This week/);
  });

  test("on Sunday, / still shows the ending week", async () => {
    nowValue = new Date("2026-10-18T20:00:00Z"); // Sunday 22:00 in Zurich
    try {
      expect(await (await get(`${viewer}/`)).text()).toMatch(
        /Mon 12 – Sun 18 Oct/,
      );
    } finally {
      nowValue = new Date("2026-10-15T10:00:00Z");
    }
  });

  test("late Sunday UTC is already Monday in Zurich", async () => {
    nowValue = new Date("2026-10-18T23:30:00Z");
    try {
      expect(await (await get(`${viewer}/`)).text()).toMatch(
        /Mon 19 – Sun 25 Oct/,
      );
    } finally {
      nowValue = new Date("2026-10-15T10:00:00Z");
    }
  });

  test("/week/<Monday> shows that week", async () => {
    const res = await get(`${viewer}/week/2026-10-05`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/Mon 5 – Sun 11 Oct/);
    expect(body).toMatch(/Last week/);
  });

  test("a non-Monday date redirects to its Monday", async () => {
    const res = await get(`${viewer}/week/2026-10-15`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/week/2026-10-12");
  });

  test.each(["2026-13-40", "2026-02-30", "monday", "2026-10-12.html"])(
    "an invalid date (%s) is a 404 page",
    async (date) => {
      const res = await get(`${viewer}/week/${date}`);
      expect(res.status).toBe(404);
      expect(await res.text()).toMatch(/Not found/);
    },
  );

  test("an unplanned week shows the empty state with navigation", async () => {
    const body = await (await get(`${viewer}/week/2026-11-02`)).text();
    expect(body).toMatch(/Nothing planned for this week yet/);
    expect(body).toMatch(/rel="next" href="\/week\/2026-11-09"/);
  });

  test("/history lists weeks newest first", async () => {
    const body = await (await get(`${viewer}/history`)).text();
    expect(body.indexOf("/week/2026-10-12")).toBeGreaterThan(-1);
    expect(body.indexOf("/week/2026-10-12")).toBeLessThan(
      body.indexOf("/week/2026-10-05"),
    );
  });

  test("pages carry the analytics tag and a matching CSP", async () => {
    const res = await get(`${viewer}/`);
    expect(await res.text()).toMatch(/data-website-id="site-1"/);
    expect(res.headers.get("content-security-policy")).toMatch(
      /script-src 'self' https:\/\/umami\.winterbottom\.xyz/,
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("unknown paths are a 404 page", async () => {
    expect((await get(`${viewer}/nope`)).status).toBe(404);
  });
});

describe("installable app", () => {
  test("manifest: standalone, start_url /, with a 180px apple icon", async () => {
    const res = await get(`${viewer}/manifest.webmanifest`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/manifest\+json/);
    const manifest = await res.json();
    expect(manifest).toEqual(MANIFEST);
    expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
    expect(manifest.icons.some((i) => i.sizes === "180x180")).toBe(true);
  });

  test.each(["apple-touch-icon.png", "icon-192.png", "icon-512.png"])(
    "icon %s is a PNG",
    async (name) => {
      const res = await get(`${viewer}/icons/${name}`);
      expect(res.status).toBe(200);
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(
        [...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join(""),
      ).toBe("PNG");
    },
  );

  test("the design-system assets are served", async () => {
    for (const f of [
      "winterbottom.css",
      "winterbottom-theme.js",
      "app.css",
      "swipe.js",
    ]) {
      expect((await get(`${viewer}/static/${f}`)).status).toBe(200);
    }
  });
});

// Rendering a PNG (satori, then resvg) is CPU-heavy, and the first one also
// loads fonts and WASM: allow more than vitest's 5 s on a busy CI runner.
const RENDER_TIMEOUT = 20_000;

describe("week picture", { timeout: RENDER_TIMEOUT }, () => {
  const png = (date) => get(`${viewer}/week/${date}.png`);
  const isPng = (buf) => buf.subarray(1, 4).toString() === "PNG";

  test("a planned week is an uncached PNG, never the HTML page", async () => {
    const res = await png("2026-10-12");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(isPng(buf)).toBe(true);
    expect(buf.readUInt32BE(16)).toBeGreaterThanOrEqual(1080);
  });

  test("an unplanned week or a bad date is a 404", async () => {
    expect((await png("2026-11-02")).status).toBe(404);
    expect((await png("2026-02-30")).status).toBe(404);
  });

  test("a non-Monday date redirects to its Monday's picture", async () => {
    const res = await png("2026-10-15");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/week/2026-10-12.png");
  });

  test("reflects an update, and the undo after it", async () => {
    const bytes = async () =>
      Buffer.from(await (await png("2026-10-12")).arrayBuffer());
    const before = await bytes();
    store.updateDay(
      "2026-10-16",
      { dinner: "A very different dinner with a much longer name than before" },
      "2026-10-15T09:00:00.000Z",
    );
    const after = await bytes();
    expect(after.equals(before)).toBe(false);
    store.undoLastChange("2026-10-15T09:01:00.000Z");
    expect((await bytes()).equals(before)).toBe(true);
  });

  test("a planned week's page has the Share button; an unplanned one doesn't", async () => {
    const planned = await (await get(`${viewer}/week/2026-10-12`)).text();
    expect(planned).toMatch(/data-share-week="2026-10-12"/);
    expect(planned).toMatch(/src="\/static\/share\.js\?v=[\d.]+"/);
    const empty = await (await get(`${viewer}/week/2026-11-02`)).text();
    expect(empty).not.toMatch(/data-share-week|share\.js/);
  });
});

describe("the two listeners never overlap", () => {
  test.each([
    "/",
    "/week/2026-10-12",
    "/week/2026-10-12.png",
    "/history",
    "/manifest.webmanifest",
  ])("MCP listener does not serve viewer path %s", async (path) => {
    const res = await fetch(`${mcp}${path}`, {
      headers: { "x-api-key": KEY },
      redirect: "manual",
    });
    expect(res.status).toBe(404);
  });

  test.each([
    ["GET", "/mcp"],
    ["POST", "/mcp"],
    ["POST", "/oauth/register"],
    ["GET", "/oauth/authorize"],
    ["GET", "/.well-known/oauth-authorization-server"],
  ])("viewer listener does not serve %s %s", async (method, path) => {
    const res = await fetch(`${viewer}${path}`, {
      method,
      headers: { "x-api-key": KEY, "content-type": "application/json" },
      body: method === "POST" ? "{}" : undefined,
    });
    expect(res.status).toBe(404);
  });
});

describe("contentSecurityPolicy", () => {
  test("same-origin only without analytics, or with a bad URL", () => {
    expect(contentSecurityPolicy()).toMatch(/script-src 'self';/);
    expect(
      contentSecurityPolicy({ scriptUrl: "not a url", websiteId: "x" }),
    ).toMatch(/script-src 'self';/);
    expect(contentSecurityPolicy({ scriptUrl: "https://u/s.js" })).toMatch(
      /script-src 'self';/,
    );
  });
});

describe("offline support", () => {
  test("/sw.js is served from the root, uncached, with the version in", async () => {
    const r = await fetch(`${viewer}/sw.js`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/javascript/);
    expect(r.headers.get("cache-control")).toBe("no-cache");
    const body = await r.text();
    expect(body).toMatch(/const VERSION = "\d+\.\d+\.\d+";/);
  });

  test("/offline is the fallback page", async () => {
    const r = await fetch(`${viewer}/offline`);
    expect(r.status).toBe(200);
    expect(await r.text()).toMatch(/You're offline/);
  });

  test("every page loads the offline script; day rows carry their date", async () => {
    const body = await (await fetch(`${viewer}/week/2026-10-12`)).text();
    expect(body).toMatch(
      /<script type="module" src="\/static\/offline.js\?v=[\d.]+">/,
    );
    expect(body).toMatch(/data-date="2026-10-12"/);
    expect(await (await fetch(`${viewer}/history`)).text()).toMatch(
      /static\/offline.js/,
    );
  });

  test("the MCP listener doesn't serve the service worker", async () => {
    expect((await fetch(`${mcp}/sw.js`)).status).toBe(404);
    expect((await fetch(`${mcp}/offline`)).status).toBe(404);
  });
});

describe("dish pictures", () => {
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("x"),
  ]);
  let picViewer, picStore, dir, fishKey;

  beforeAll(async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { dishKey } = await import("../src/images/dish.js");
    dir = mkdtempSync(join(tmpdir(), "pics-"));
    picStore = openStore();
    picStore.saveWeek(
      {
        week_start: "2026-10-12",
        days: [
          { date: "2026-10-12", dinner: "Fish pie" },
          { date: "2026-10-13", dinner: "Rack of lamb" },
        ],
      },
      "2026-10-10T00:00:00.000Z",
    );
    picStore.syncDishImages("2026-10-10T00:00:00.000Z");
    fishKey = dishKey("Fish pie");
    picStore.updateDish(
      fishKey,
      { status: "done", attempts: 0 },
      "2026-10-11T00:00:00.000Z",
    );
    writeFileSync(join(dir, `${fishKey}.png`), PNG);
    const config = readConfig({
      MCP_API_KEY: KEY,
      FOOD_IMAGE_URL: "http://desktop-home:8190",
      FOOD_IMAGE_API_KEY: KEY,
      DISH_IMAGES_DIR: dir,
    });
    picViewer = await listen(
      createViewerApp({ store: picStore, config, now: () => nowValue }),
    );
  });

  test("a finished picture shows beside its dinner; a pending one doesn't", async () => {
    const page = await (await fetch(`${picViewer}/week/2026-10-12`)).text();
    const imgs = [
      ...page.matchAll(/<img class="mp-day__img" src="([^"]+)" alt="([^"]+)"/g),
    ];
    expect(imgs.map((m) => m[2])).toEqual(["Fish pie"]);
    expect(imgs[0][1]).toMatch(
      new RegExp(`^/dish-images/${fishKey}\\.png\\?v=[0-9a-z]+$`),
    );
    const r = await fetch(`${picViewer}${imgs[0][1].replace("&amp;", "&")}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("cache-control")).toMatch(/immutable/);
    expect(Buffer.from(await r.arrayBuffer())).toEqual(PNG);
  });

  test.each([
    "/dish-images/0000000000000000.png", // no such picture
    "/dish-images/..%2Fmeals.db",
    "/dish-images/ABCDEF0123456789.png", // upper case is not a key
    `/dish-images/x.png`,
  ])("%s is 404", async (path) => {
    expect((await fetch(`${picViewer}${path}`)).status).toBe(404);
  });

  test("saved pictures still show with the food-image service unset", async () => {
    const config = readConfig({ MCP_API_KEY: KEY, DISH_IMAGES_DIR: dir });
    expect(config.dishImages.url).toBeFalsy();
    const offViewer = await listen(
      createViewerApp({ store: picStore, config, now: () => nowValue }),
    );
    const page = await (await fetch(`${offViewer}/week/2026-10-12`)).text();
    const [, src] = /<img class="mp-day__img" src="([^"]+)"/.exec(page);
    // No service to make a new one: the dish page has no button, and the
    // redo route is closed.
    const dish = await (await fetch(`${offViewer}/dish/${fishKey}`)).text();
    expect(dish).toMatch(/<h1>Fish pie<\/h1>/);
    expect(dish).not.toMatch(/New picture<\/button>/);
    expect(
      (
        await fetch(`${offViewer}/dish/${fishKey}/redo`, {
          method: "POST",
          headers: { "sec-fetch-site": "same-origin" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await fetch(`${offViewer}${src.replace("&amp;", "&")}`)).status,
    ).toBe(200);
  });

  test("a picture marked done but missing on disk isn't shown", async () => {
    const { unlinkSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const file = join(dir, `${fishKey}.png`);
    unlinkSync(file);
    try {
      const page = await (await fetch(`${picViewer}/week/2026-10-12`)).text();
      expect(page).not.toMatch(/mp-day__img/);
    } finally {
      writeFileSync(file, PNG);
    }
  });

  test("with no saved pictures, none is shown or served", async () => {
    const page = await (await fetch(`${viewer}/week/2026-10-12`)).text();
    expect(page).not.toMatch(/mp-day__img/);
    expect((await fetch(`${viewer}/dish-images/${fishKey}.png`)).status).toBe(
      404,
    );
  });

  test("tapping a picture opens its dish page; New picture queues a redo", async () => {
    const week = await (await fetch(`${picViewer}/week/2026-10-12`)).text();
    const [, href] = /class="mp-day__imglink" href="([^"]+)"/.exec(week);
    expect(href).toBe(`/dish/${fishKey}?week=2026-10-12`);
    const pageUrl = `${picViewer}${href}`;
    const dish = await (await fetch(pageUrl)).text();
    expect(dish).toMatch(/<h1>Fish pie<\/h1>/);
    expect(dish).toMatch(/href="\/week\/2026-10-12"/);
    expect(dish).toMatch(
      new RegExp(
        `<form method="post" action="/dish/${fishKey}/redo\\?week=2026-10-12">`,
      ),
    );

    const post = () =>
      fetch(`${picViewer}/dish/${fishKey}/redo?week=2026-10-12`, {
        method: "POST",
        redirect: "manual",
        headers: { "sec-fetch-site": "same-origin" },
      });
    const r = await post();
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`/dish/${fishKey}?week=2026-10-12`);
    const row = picStore.getDish(fishKey);
    expect(row).toMatchObject({ status: "done", redo: 1 });
    // A second press while queued changes nothing.
    await post();
    expect(picStore.getDish(fishKey).generation).toBe(row.generation);
    const queued = await (await fetch(pageUrl)).text();
    expect(queued).toMatch(/A new picture is on its way/);
    expect(queued).not.toMatch(/<form/);
    // The old picture still shows in the week meanwhile.
    expect(await (await fetch(`${picViewer}/week/2026-10-12`)).text()).toMatch(
      /class="mp-day__img"/,
    );
    picStore.updateDish(
      fishKey,
      { status: "done", attempts: 0 },
      row.updated_at,
    );
  });

  test("a cross-site New picture is refused", async () => {
    const r = await fetch(`${picViewer}/dish/${fishKey}/redo`, {
      method: "POST",
      redirect: "manual",
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(r.status).toBe(403);
    expect(picStore.getDish(fishKey).redo).toBe(0);
  });

  test.each([
    "/dish/0000000000000000", // no such dish
    "/dish/ABCDEF0123456789", // not a key
  ])("%s is 404", async (path) => {
    expect((await fetch(`${picViewer}${path}`)).status).toBe(404);
  });

  test("a dish without a finished picture has no page", async () => {
    const { dishKey } = await import("../src/images/dish.js");
    expect(
      (await fetch(`${picViewer}/dish/${dishKey("Rack of lamb")}`)).status,
    ).toBe(404);
  });

  test("a bad week value falls back to this week for the back link", async () => {
    const page = await (
      await fetch(`${picViewer}/dish/${fishKey}?week=2026-10-13`)
    ).text();
    expect(page).toMatch(/class="mp-dish__back" href="\/"/);
  });

  test("the MCP listener never serves pictures", async () => {
    expect((await fetch(`${mcp}/dish-images/${fishKey}.png`)).status).toBe(404);
  });
});

describe("Lisa's original (upload)", () => {
  const jpeg = () =>
    sharp({
      create: { width: 60, height: 40, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer();
  const post = async (fields, { file, headers } = {}) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (file) form.append("image", new Blob([file.data]), file.name);
    return fetch(`${viewer}/upload`, {
      method: "POST",
      body: form,
      redirect: "manual",
      headers: { "sec-fetch-site": "same-origin", ...headers },
    });
  };

  test("the upload page defaults to the next unplanned Monday, or ?week=", async () => {
    nowValue = new Date("2026-10-15T10:00:00Z");
    const page = await (await get(`${viewer}/upload`)).text();
    expect(page).toMatch(/<option value="2026-10-19" selected>/);
    expect(page).toMatch(/enctype="multipart\/form-data"/);
    const pre = await (await get(`${viewer}/upload?week=2026-11-02`)).text();
    expect(pre).toMatch(/<option value="2026-11-02" selected>/);
    expect(pre).toMatch(/2026-10-12"[^>]*>Mon 12 – Sun 18 Oct · planned/);
  });

  test("the empty week links to the upload with that week preselected", async () => {
    const body = await (await get(`${viewer}/week/2026-11-02`)).text();
    expect(body).toMatch(/href="\/upload\?week=2026-11-02"/);
  });

  test("an upload for an unplanned week shows the image full width, without metadata", async () => {
    const res = await post(
      { week: "2026-11-09" },
      { file: { data: await jpeg(), name: "IMG_1.jpg" } },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/week/2026-11-09");
    const week = store.getWeek("2026-11-09");
    expect(week).toMatchObject({ status: "image_only", source: "Lisa" });
    const page = await (await get(`${viewer}/week/2026-11-09`)).text();
    const src = `/plan-images/${week.image_id}.jpg`;
    expect(page).toContain(`<a href="${src}"><img src="${src}"`);
    expect(page).toMatch(/mp-original--full/);
    expect(page).not.toMatch(/data-share-week/);
    expect((await get(`${viewer}/week/2026-11-09.png`)).status).toBe(404);

    const img = await get(`${viewer}${src}`);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(img.headers.get("cache-control")).toMatch(/private/);
    expect(readdirSync(planImagesDir)).toContain(`${week.image_id}.jpg`);
  });

  test("a week with data shows it, with the image under Lisa's original", async () => {
    const res = await post(
      { week: "2026-10-12" },
      { file: { data: await jpeg(), name: "plan.jpg" } },
    );
    expect(res.status).toBe(303);
    const page = await (await get(`${viewer}/week/2026-10-12`)).text();
    expect(page).toMatch(/<details class="mp-block mp-original">/);
    expect(page).toMatch(/Lisa's original<\/summary>/);
    expect(page).toMatch(/Thomas at Kita/);
    expect(page).toMatch(/data-share-week/);
    store.undoLastChange(new Date().toISOString());
    expect(store.getWeek("2026-10-12").image_id).toBeNull();
  });

  test("rejections: wrong type, no file, bad week, too big; nothing stored", async () => {
    const before = readdirSync(planImagesDir).length;
    const pdf = await post(
      { week: "2026-11-16" },
      { file: { data: Buffer.from("%PDF-1.7 not an image"), name: "x.pdf" } },
    );
    expect(pdf.status).toBe(400);
    expect(await pdf.text()).toMatch(/Unsupported file type/);
    const none = await post({ week: "2026-11-16" });
    expect(none.status).toBe(400);
    expect(await none.text()).toMatch(/Choose a photo/);
    const tuesday = await post(
      { week: "2026-11-17" },
      { file: { data: await jpeg(), name: "a.jpg" } },
    );
    expect(await tuesday.text()).toMatch(/Choose a week/);
    const huge = await post(
      { week: "2026-11-16" },
      { file: { data: Buffer.alloc(16 * 1024 * 1024, 1), name: "big.jpg" } },
    );
    expect(huge.status).toBe(413);
    expect(store.getWeek("2026-11-16")).toBeNull();
    expect(readdirSync(planImagesDir)).toHaveLength(before);
  });

  test("a cross-site POST is refused before anything is read", async () => {
    const res = await post(
      { week: "2026-11-23" },
      {
        file: { data: await jpeg(), name: "a.jpg" },
        headers: { "sec-fetch-site": "cross-site" },
      },
    );
    expect(res.status).toBe(403);
    expect(store.getWeek("2026-11-23")).toBeNull();
  });

  test("at most two uploads run at once; a third is told to retry", async () => {
    // Two uploads whose bodies never finish hold both slots.
    const hold = () => {
      let close;
      const body = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("--x\r\n"));
          close = () => c.close();
        },
      });
      const done = fetch(`${viewer}/upload`, {
        method: "POST",
        body,
        duplex: "half",
        headers: {
          "sec-fetch-site": "same-origin",
          "content-type": "multipart/form-data; boundary=x",
        },
      }).catch(() => null);
      return { close: () => close(), done };
    };
    const a = hold();
    const b = hold();
    await new Promise((r) => setTimeout(r, 100));
    const third = await post(
      { week: "2026-11-30" },
      { file: { data: await jpeg(), name: "a.jpg" } },
    );
    expect(third.status).toBe(503);
    expect(third.headers.get("retry-after")).toBe("5");
    a.close();
    b.close();
    await Promise.all([a.done, b.done]);
    await new Promise((r) => setTimeout(r, 50));
    const after = await post(
      { week: "2026-11-30" },
      { file: { data: await jpeg(), name: "a.jpg" } },
    );
    expect(after.status).toBe(303);
  });

  test("unknown or malformed image names are a 404", async () => {
    expect(
      (await get(`${viewer}/plan-images/${"f".repeat(32)}.jpg`)).status,
    ).toBe(404);
    expect((await get(`${viewer}/plan-images/..%2Fmeals.db`)).status).toBe(404);
  });

  test("the MCP listener serves neither the upload nor the images", async () => {
    for (const path of ["/upload", `/plan-images/${"f".repeat(32)}.jpg`]) {
      const res = await fetch(`${mcp}${path}`, {
        headers: { "x-api-key": KEY },
        redirect: "manual",
      });
      expect(res.status).toBe(404);
    }
  });
});

describe("isSameOrigin", () => {
  const req = (headers) => ({ get: (h) => headers[h.toLowerCase()] });
  test.each([
    [{ "sec-fetch-site": "same-origin" }, true],
    [{ "sec-fetch-site": "same-site" }, false],
    [{ "sec-fetch-site": "cross-site", origin: "https://meals.x" }, false],
    [{ origin: "https://meals.x", host: "meals.x" }, true],
    [
      {
        origin: "https://meals.x",
        "x-forwarded-host": "meals.x",
        host: "app:3001",
      },
      true,
    ],
    [{ origin: "https://evil.example", host: "meals.x" }, false],
    [{ origin: "not a url", host: "meals.x" }, false],
    [{ host: "meals.x" }, false],
  ])("%o -> %s", (headers, ok) => {
    expect(isSameOrigin(req(headers))).toBe(ok);
  });
});

describe("food pictures in the share picture", () => {
  test("finished pictures of any meal become thumbnails; others and broken files are left out", async () => {
    const { writeFileSync } = await import("node:fs");
    const { dishKey } = await import("../src/images/dish.js");
    const dir = mkdtempSync(join(tmpdir(), "thumbs-"));
    const s = openStore();
    try {
      s.saveWeek(
        {
          week_start: "2026-10-12",
          days: [
            {
              date: "2026-10-12",
              morning_snack: "Fruit",
              lunch: "Kita",
              dinner: "Fish pie",
            },
            { date: "2026-10-13", dinner: "Rack of lamb" },
          ],
        },
        "2026-10-10T00:00:00.000Z",
      );
      expect(s.syncDishImages("2026-10-10T00:00:00.000Z")).toBe(4);
      expect(s.getDish(dishKey("Fruit")).status).toBe("pending");
      expect(s.getDish(dishKey("Kita")).status).toBe("skipped");
      const real = await sharp({
        create: { width: 300, height: 300, channels: 3, background: "#c84" },
      })
        .png()
        .toBuffer();
      for (const text of ["Fish pie", "Fruit", "Rack of lamb"]) {
        s.updateDish(
          dishKey(text),
          { status: "done", attempts: 0 },
          "2026-10-11T00:00:00.000Z",
        );
      }
      writeFileSync(join(dir, `${dishKey("Fish pie")}.png`), real);
      writeFileSync(join(dir, `${dishKey("Fruit")}.png`), real);
      writeFileSync(join(dir, `${dishKey("Rack of lamb")}.png`), "broken");
      const thumbs = await dishThumbnails(s, dir, [
        "Fish pie",
        "Fruit",
        "Rack of lamb",
        "Kita",
        null,
        "Unknown",
      ]);
      expect([...thumbs.keys()].sort()).toEqual(["Fish pie", "Fruit"]);
      const meta = await sharp(
        Buffer.from(thumbs.get("Fruit").split(",")[1], "base64"),
      ).metadata();
      expect(meta).toMatchObject({ format: "jpeg", width: 176, height: 176 });
    } finally {
      s.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
