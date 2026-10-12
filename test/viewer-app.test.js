import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  contentSecurityPolicy,
  createViewerApp,
  MANIFEST,
} from "../src/viewer-app.js";
import { createMcpApp } from "../src/mcp-app.js";
import { readConfig } from "../src/config.js";
import { openStore } from "../src/store.js";
import { seedIfEmpty } from "../src/seed/weeks.js";

const KEY = "k".repeat(64);
let nowValue = new Date("2026-10-15T10:00:00Z"); // Thursday of the 2026-10-12 week
const servers = [];
let viewer, mcp, store;

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
  });
  viewer = await listen(
    createViewerApp({ store, config, now: () => nowValue }),
  );
  mcp = await listen(createMcpApp({ store, config, now: () => nowValue }));
});
afterAll(() => {
  servers.forEach((s) => s.close());
  store.close();
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

describe("week picture", () => {
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
    expect(planned).toMatch(/src="\/static\/share\.js"/);
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
    expect(body).toMatch(/<script type="module" src="\/static\/offline.js">/);
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

  test("with pictures off, no picture is shown or served", async () => {
    const page = await (await fetch(`${viewer}/week/2026-10-12`)).text();
    expect(page).not.toMatch(/mp-day__img/);
    expect((await fetch(`${viewer}/dish-images/${fishKey}.png`)).status).toBe(
      404,
    );
  });

  test("the MCP listener never serves pictures", async () => {
    expect((await fetch(`${mcp}/dish-images/${fishKey}.png`)).status).toBe(404);
  });
});
