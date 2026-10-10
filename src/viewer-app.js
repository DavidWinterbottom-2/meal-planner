// The viewer listener: the read-only phone pages. It is only ever reached
// through the entra-auth-proxy sidecar (VIEWER_PORT is exposed on the docker
// network, never published), so it carries no login code of its own and
// trusts nothing from the sidecar's headers. It serves no MCP or OAuth routes,
// and the MCP listener serves none of these.

import express from "express";
import { fileURLToPath } from "node:url";
import { isIsoDate, isMonday, weekOf, zurichToday } from "./domain/dates.js";
import { buildHistoryView, buildWeekView } from "./web/view.js";
import { renderHistory, renderNotFound, renderWeek } from "./web/render.js";

const STATIC_DIR = fileURLToPath(new URL("./web/static/", import.meta.url));
const ICONS_DIR = fileURLToPath(
  new URL("./web/static/icons/", import.meta.url),
);

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

export function createViewerApp({ store, config, now = () => new Date() }) {
  const app = express();
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
      renderWeek(buildWeekView(store.getWeek(weekStart), weekStart, today), {
        analytics,
      }),
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
      renderWeek(buildWeekView(store.getWeek(date), date, today), {
        analytics,
      }),
    );
  });

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
