// The viewer listener: the read-only phone pages. It is only ever reached
// through the entra-auth-proxy sidecar (VIEWER_PORT is exposed on the docker
// network, never published), so it carries no login code of its own and
// trusts nothing from the sidecar's headers. It serves no MCP or OAuth routes,
// and the MCP listener serves none of these.

import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  addDays,
  isIsoDate,
  isMonday,
  weekOf,
  zurichToday,
} from "./domain/dates.js";
import { buildHistoryView, buildWeekView, weekHeading } from "./web/view.js";
import { renderWeekPng } from "./web/week-image.js";
import multer from "multer";
import sharp from "sharp";
import {
  isPlanImageId,
  MAX_UPLOAD_BYTES,
  planImagePath,
  removePlanImage,
  sanitiseImage,
  UploadError,
  writePlanImage,
} from "./images/plan-image.js";
import { dishKey } from "./images/dish.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { dishImagePath } from "./images/worker.js";
import {
  renderHistory,
  renderNotFound,
  renderOffline,
  renderUpload,
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
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

// A form POST must come from this site's own pages. Browsers send
// Sec-Fetch-Site on every request (Safari since 16.4); older ones send
// Origin on a POST, checked against the host the request came in on.
export function isSameOrigin(req) {
  const site = req.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.get("origin");
  if (!origin) return false;
  try {
    const { host } = new URL(origin);
    return [req.get("x-forwarded-host"), req.get("host")].includes(host);
  } catch {
    return false;
  }
}

// The Mondays offered on the upload page: two weeks back to eight ahead,
// plus the preselected one if it falls outside that.
export function uploadWeeks(store, today, selected) {
  const current = weekOf(today);
  const starts = new Set(
    Array.from({ length: 11 }, (_, i) => addDays(current, (i - 2) * 7)),
  );
  if (selected) starts.add(selected);
  return [...starts].sort().map((weekStart) => ({
    weekStart,
    heading: weekHeading(weekStart),
    planned: Boolean(store.getWeek(weekStart)),
  }));
}

// Finished food pictures for the share image, shrunk to thumbnails as data
// URIs: meal text -> data URI. Missing, pending or skipped meals are left
// out. Cached by key and picture time, so a regenerated picture is reloaded.
const thumbCache = new Map();
export async function dishThumbnails(store, dir, texts) {
  const out = new Map();
  for (const text of new Set(texts.filter(Boolean))) {
    const key = dishKey(text);
    const row = store.dishImages([key]).get(key);
    if (row?.status !== "done") continue;
    const cacheKey = `${key}:${row.updated_at}`;
    if (!thumbCache.has(cacheKey)) {
      const file = dishImagePath(dir, key);
      if (!existsSync(file)) continue;
      let jpeg;
      try {
        jpeg = await sharp(file)
          .resize(176, 176, { fit: "cover" })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch {
        continue; // An unreadable picture just isn't shown.
      }
      thumbCache.set(
        cacheKey,
        `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      );
    }
    out.set(text, thumbCache.get(cacheKey));
  }
  return out;
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

  // Lisa's original plan images, behind the login like the pages. The name
  // must be a 32-hex id the store knows, so nothing else is reachable.
  app.get("/plan-images/:file", (req, res, next) => {
    const m = /^([0-9a-f]{32})\.jpg$/.exec(req.params.file);
    if (!m || !isPlanImageId(m[1]) || !store.getImage(m[1])) return next();
    const file = planImagePath(config.planImagesDir, m[1]);
    if (!existsSync(file)) return next();
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

  // The week as a picture for sharing (OpenSpec add-week-png-share).
  // Registered before /week/:date; rendered on every request, so it always
  // shows the week as stored now (after an update, delete or undo too).
  app.get("/week/:date.png", async (req, res) => {
    const { date } = req.params;
    if (!isIsoDate(date)) return page(res, 404, renderNotFound({ analytics }));
    if (!isMonday(date)) return res.redirect(302, `/week/${weekOf(date)}.png`);
    const week = store.getWeek(date);
    if (!week || week.status === "image_only")
      return page(res, 404, renderNotFound({ analytics }));
    const view = buildWeekView(week, date, zurichToday(now()));
    const thumbs = config.dishImages?.url
      ? await dishThumbnails(
          store,
          imagesDir,
          view.days.flatMap((d) => [
            d.dinner,
            d.lunch,
            d.morning_snack,
            d.afternoon_snack,
          ]),
        )
      : new Map();
    const png = await renderWeekPng(view, {
      dishPicture: (text) => thumbs.get(text) ?? null,
    });
    res.set("Cache-Control", "no-store").type("png").send(png);
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

  // Upload Lisa's plan image (add-lisa-image-upload).
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4 },
  }).single("image");
  const uploadPage = (res, status, today, selected, error) =>
    page(
      res,
      status,
      renderUpload({
        weeks: uploadWeeks(store, today, selected),
        selected,
        error,
        analytics,
      }),
    );

  app.get("/upload", (req, res) => {
    const today = zurichToday(now());
    const asked = String(req.query.week ?? "");
    const selected =
      isIsoDate(asked) && isMonday(asked)
        ? asked
        : store.nextUnplannedMonday(weekOf(today));
    uploadPage(res, 200, today, selected);
  });

  // Each upload holds up to 15 MB in memory plus sharp's decode, so only a
  // couple run at once on the Pi.
  let uploadsInFlight = 0;
  const MAX_UPLOADS_IN_FLIGHT = 2;

  app.post("/upload", (req, res, next) => {
    const today = zurichToday(now());
    if (!isSameOrigin(req))
      return res.status(403).type("text").send("Forbidden");
    if (uploadsInFlight >= MAX_UPLOADS_IN_FLIGHT)
      return res
        .status(503)
        .set("Retry-After", "5")
        .type("text")
        .send("Busy saving another photo. Try again in a moment.");
    uploadsInFlight++;
    res.on("close", () => uploadsInFlight--);
    upload(req, res, async (err) => {
      try {
        await handleUpload(req, res, next, err, today);
      } catch (e) {
        next(e);
      }
    });
  });

  async function handleUpload(req, res, next, err, today) {
    const week = String(req.body?.week ?? "");
    const selected = isIsoDate(week) && isMonday(week) ? week : null;
    const fail = (status, message) =>
      uploadPage(
        res,
        status,
        today,
        selected ?? store.nextUnplannedMonday(weekOf(today)),
        message,
      );
    if (err?.code === "LIMIT_FILE_SIZE")
      return fail(413, "That photo is over 15 MB. Choose a smaller one.");
    if (err) return fail(400, "That upload didn't work. Try again.");
    if (!selected) return fail(400, "Choose a week (a Monday).");
    if (!req.file) return fail(400, "Choose a photo.");
    try {
      const jpeg = await sanitiseImage(req.file.buffer);
      const saved = writePlanImage(config.planImagesDir, jpeg);
      try {
        store.attachImage(
          selected,
          { ...saved, original_name: req.file.originalname },
          now().toISOString(),
        );
      } catch (e) {
        removePlanImage(config.planImagesDir, saved.id);
        throw e;
      }
      res.redirect(303, `/week/${selected}`);
    } catch (e) {
      if (e instanceof UploadError) return fail(400, e.message);
      next(e);
    }
  }

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
