import { test, expect } from "@playwright/test";

const MCP = process.env.E2E_MCP_URL || "http://127.0.0.1:3000";
// A seeded week, so the content doesn't depend on today's date.
const WEEK = "/week/2026-10-12";

test.describe("viewer listener", () => {
  test("the seeded week renders with seven days, Kita and the source", async ({
    page,
  }) => {
    await page.goto(WEEK);
    await expect(page.locator("h1")).toHaveText("Mon 12 – Sun 18 Oct");
    await expect(page.locator(".mp-day")).toHaveCount(7);
    await expect(page.locator(".mp-day").first()).toContainText(
      "Thomas at Kita",
    );
    await expect(page.getByText("David's plan")).toBeVisible();
  });

  for (const scheme of ["light", "dark"]) {
    test(`no horizontal scroll at 390px (${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ["/", WEEK, "/history", "/week/2026-11-02"]) {
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow, path).toBeLessThanOrEqual(0);
        // Brand, icon buttons, sign-out and theme toggle stay on one line.
        const header = await page.locator(".wb-appbar").boundingBox();
        expect(header.height, path).toBeLessThan(70);
      }
      await page.goto(WEEK);
      await page.screenshot({
        path: `test-results/screenshots/week-390-${scheme}.png`,
        fullPage: true,
      });
    });
  }

  test("the header stays on one line on narrow phones, even with large text", async ({
    page,
  }) => {
    for (const width of [320, 360, 390, 412]) {
      for (const textScale of ["100%", "130%"]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/");
        // Android's text-size setting scales rem-based text like this.
        await page.evaluate((scale) => {
          document.documentElement.style.fontSize = scale;
        }, textScale);
        const header = await page.locator(".wb-appbar").boundingBox();
        const label = `${width}px, text ${textScale}`;
        expect(header.height, label).toBeLessThan(70);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow, label).toBeLessThanOrEqual(0);
      }
    }
  });

  test("only today shows the Today pill", async ({ page }) => {
    // "/" always contains today; every other row's pill must stay hidden.
    await page.goto("/");
    await expect(page.locator(".mp-today-pill:visible")).toHaveCount(1);
    await expect(page.locator(".mp-day--today .mp-today-pill")).toBeVisible();
  });

  test("dark mode follows the device", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(WEEK);
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bg).toBe("rgb(12, 14, 18)"); // --bg in dark
  });

  async function swipe(page, dx, dy) {
    await page.evaluate(
      ([dx, dy]) => {
        const at = (x, y) =>
          new Touch({
            identifier: 1,
            target: document.body,
            clientX: x,
            clientY: y,
          });
        const fire = (type, t) =>
          document.dispatchEvent(
            new TouchEvent(type, {
              changedTouches: [t],
              touches: type === "touchend" ? [] : [t],
              bubbles: true,
            }),
          );
        fire("touchstart", at(200, 300));
        fire("touchend", at(200 + dx, 300 + dy));
      },
      [dx, dy],
    );
  }

  test("swiping left goes to the next week, right to the previous", async ({
    page,
  }) => {
    await page.goto(WEEK);
    await Promise.all([
      page.waitForURL("**/week/2026-10-19"),
      swipe(page, -150, 10),
    ]);
    await Promise.all([
      page.waitForURL("**/week/2026-10-12"),
      swipe(page, 150, -10),
    ]);
  });

  test("a vertical scroll with drift does not navigate", async ({ page }) => {
    await page.goto(WEEK);
    await swipe(page, -80, 200);
    await page.waitForTimeout(300);
    expect(new URL(page.url()).pathname).toBe(WEEK);
  });

  test("the manifest is installable", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({
      display: "standalone",
      start_url: "/",
    });
  });

  test("Chromium reports the app as installable", async ({ page }) => {
    await page.goto("/");
    const cdp = await page.context().newCDPSession(page);
    const manifest = await cdp.send("Page.getAppManifest");
    expect(manifest.errors).toEqual([]);
    const { installabilityErrors } = await cdp.send(
      "Page.getInstallabilityErrors",
    );
    expect(installabilityErrors).toEqual([]);
  });

  test("viewer pages have no forms", async ({ page }) => {
    for (const path of ["/", WEEK, "/history"]) {
      await page.goto(path);
      await expect(page.locator("form, input, textarea, select")).toHaveCount(
        0,
      );
    }
  });

  test("a week opened online still shows with the network off", async ({
    page,
    context,
  }) => {
    await page.goto(WEEK);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // The first load ran before the worker took over; this one is saved.
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(async (path) => Boolean(await caches.match(path)), WEEK),
      )
      .toBe(true);

    // setOffline makes the page see "offline"; the route also cuts off the
    // service worker's own requests, which setOffline doesn't reach in
    // Chromium.
    await context.setOffline(true);
    await context.route("**/*", (route) => route.abort("internetdisconnected"));
    try {
      await page.reload();
      await expect(page.locator("h1")).toHaveText("Mon 12 – Sun 18 Oct");
      await expect(page.locator(".mp-offline")).toBeVisible();
      await expect(page.locator(".mp-day")).toHaveCount(7);

      await page.goto("/week/2027-01-04");
      await expect(page.locator("h1")).toHaveText("You're offline");
    } finally {
      await context.unroute("**/*");
      await context.setOffline(false);
    }
  });

  test("the viewer does not serve MCP or OAuth routes", async ({ request }) => {
    for (const path of ["/mcp", "/oauth/register", "/health"]) {
      expect((await request.post(path, { data: {} })).status(), path).toBe(404);
    }
  });
});

test.describe("MCP listener", () => {
  test("rejects an unauthenticated MCP call", async ({ request }) => {
    expect((await request.post(`${MCP}/mcp`, { data: {} })).status()).toBe(401);
  });

  test("does not serve viewer pages", async ({ request }) => {
    for (const path of ["/", WEEK, "/history", "/manifest.webmanifest"]) {
      expect((await request.get(`${MCP}${path}`)).status(), path).toBe(404);
    }
  });
});
