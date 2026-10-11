// Regenerates docs/screenshots/ (used by WALKTHROUGH.md) from a running
// viewer. Start the app on an empty database first so it seeds the two
// example weeks (see README "Run locally"), then:
//   npm run screenshots              # viewer at http://127.0.0.1:3001
//   VIEWER_URL=http://host:3001 npm run screenshots
// "/" follows today's date, so the "this week" shots change over time.
import { chromium, devices } from "@playwright/test";

const base = process.env.VIEWER_URL || "http://127.0.0.1:3001";
const out = "docs/screenshots";
const phone = { ...devices["iPhone 13"], deviceScaleFactor: 2 };
const desktop = { viewport: { width: 1280, height: 900 } };

// [file, context, path, colour scheme, full page]
const shots = [
  ["mobile-week-light", phone, "/", "light", true],
  ["mobile-week-dark", phone, "/", "dark", true],
  ["mobile-next-week", phone, "/week/2026-10-12", "light", true],
  ["mobile-empty-week", phone, "/week/2026-11-02", "light", false],
  ["mobile-history", phone, "/history", "light", false],
  ["desktop-week-light", desktop, "/", "light", true],
  ["desktop-week-dark", desktop, "/", "dark", true],
  ["desktop-history", desktop, "/history", "light", false],
];

const browser = await chromium.launch();
for (const [file, context, path, colorScheme, fullPage] of shots) {
  const ctx = await browser.newContext({ ...context, colorScheme });
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/${file}.png`, fullPage });
  await ctx.close();
  console.log(`${out}/${file}.png`);
}
await browser.close();
