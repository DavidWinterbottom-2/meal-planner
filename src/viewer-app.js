// The viewer listener: the read-only phone pages. It is only ever reached
// through the entra-auth-proxy sidecar (VIEWER_PORT is exposed on the docker
// network, never published), so it carries no login code of its own and
// trusts nothing from the sidecar's headers. It serves no MCP or OAuth routes,
// and the MCP listener serves none of these.

import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isIsoDate, isMonday, weekOf, zurichToday } from "./domain/dates.js";
import { buildHistoryView, buildWeekView } from "./web/view.js";
import { dishKey } from "./images/dish.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { dishImagePath } from "./images/worker.js";
import {
  renderHistory,
  renderNotFound,
  renderOffline,
  renderWeek,
} from "./web/render.js";

const STATIC_DIR = fileURLToPath(new URL("./web/static/", import.meta.url));
const ICONS_DIR = fileURLToPath(
  new URL("./web/static/icons/", import.meta.url),
);

const PACKAGE = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

// The service worker with this release's version baked in, so every release
// starts a fresh offline cache (and drops the previous one).
export function serviceWorkerScript(version = PACKAGE.version) {
  return readFileSync(
    new URL("./web/static/sw.js", import.meta.url),
    "utf8",
  ).replaceAll("__VERSION__", version);
}

export const MANIFEST = {
  name: "Meal Planner",
  short_name: "Meals",
  description: "This week's family meals",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#f3f5f8",
  theme_color: "#f3f5f8",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "/icons/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  ],
};

// Only same-origin scripts and styles, plus the Umami host when analytics is
// configured; no frames, forms or plugins.
export function contentSecurityPolicy(analytics = {}) {
  let analyticsOrigin = "";
  if (analytics.scriptUrl && analytics.websiteId) {
    try {
      analyticsOrigin = ` ${new URL(analytics.scriptUrl).origin}`;
    } catch {
      analyticsOrigin = "";
    }
  }
  return [
    "default-src 'self'",
    `script-src 'self'${analyticsOrigin}`,
    `connect-src 'self'${analyticsOrigin}`,
    "img-src 'self'",
    "style-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

// A finished dish picture's URL; ?v changes when it is regenerated, so the
// long browser cache never shows a stale picture.
export function dishImageUrl(store, dinner) {
  const key = dishKey(dinner);
  const row = store.dishImages([key]).get(key);
  if (row?.status !== "done") return null;
  return `/dish-images/${key}.png?v=${Date.parse(row.updated_at).toString(36)}`;
}

export function createViewerApp({ store, config, now = () => new Date() }) {
  const app = express();
  const imagesDir = config.dishImages?.dir;
  const imageFor = config.dishImages?.url
    ? (dinner) => dishImageUrl(store, dinner)
    : () => null;
  const analytics = config.analytics ?? {};
  const csp = contentSecurityPolicy(analytics);
  const page = (res, status, body) =>
    res.status(status).set("Cache-Control", "no-store").type("html").send(body);

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    });
    next();
  });

  // Served without login by the sidecar (OAUTH2_PROXY_SKIP_AUTH_ROUTES), so
  // the home-screen install works before signing in. Neither holds plan data.
  app.get("/manifest.webmanifest", (_req, res) =>
    res.type("application/manifest+json").send(JSON.stringify(MANIFEST)),
  );
  app.use("/icons", express.static(ICONS_DIR, { maxAge: "7d" }));

  // Generated dish pictures, behind the login like the pages. The name must
  // be a 16-hex key, so nothing outside the pictures directory is reachable.
  app.get("/dish-images/:file", (req, res, next) => {
    const m = /^([0-9a-f]{16})\.png$/.exec(req.params.file);
    const file = m && imagesDir && dishImagePath(imagesDir, m[1]);
    if (!file || !existsSync(file)) return next();
    res.set("Cache-Control", "private, max-age=2592000, immutable");
    res.sendFile(resolve(file));
  });

  // At the root so it can control every page. no-cache: the browser always
  // checks for a new release. Behind the login like the pages it caches.
  const swScript = serviceWorkerScript();
  app.get("/sw.js", (_req, res) =>
    res
      .set("Cache-Control", "no-cache")
      .type("application/javascript")
      .send(swScript),
  );
  app.use(
    "/static",
    express.static(STATIC_DIR, { maxAge: "1h", index: false }),
  );

  app.get("/", (_req, res) => {
    const today = zurichToday(now());
    const weekStart = weekOf(today);
    page(
      res,
      200,
      renderWeek(
        buildWeekView(store.getWeek(weekStart), weekStart, today, imageFor),
        {
          analytics,
        },
      ),
    );
  });

  app.get("/week/:date", (req, res) => {
    const { date } = req.params;
    if (!isIsoDate(date)) return page(res, 404, renderNotFound({ analytics }));
    if (!isMonday(date)) return res.redirect(302, `/week/${weekOf(date)}`);
    const today = zurichToday(now());
    page(
      res,
      200,
      renderWeek(buildWeekView(store.getWeek(date), date, today, imageFor), {
        analytics,
      }),
    );
  });

  // The service worker's fallback for a page not saved on the phone.
  app.get("/offline", (_req, res) =>
    page(res, 200, renderOffline({ analytics })),
  );

  app.get("/history", (_req, res) =>
    page(
      res,
      200,
      renderHistory(buildHistoryView(store.listWeeks()), { analytics }),
    ),
  );

  app.use((_req, res) => page(res, 404, renderNotFound({ analytics })));

  // A failure here must not leak details; the page is the same for everyone.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error("Viewer request failed:", err);
    res.status(500).type("text").send("Something went wrong.");
  });

  return app;
}
