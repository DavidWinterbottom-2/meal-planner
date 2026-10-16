// Service worker: keeps the meal plan readable with no signal. Pages are
// network-first (always fresh when online) and fall back to the copy saved
// on this phone; static files are cache-first. Served at /sw.js with the app
// version filled in, so each release gets a fresh cache and drops the old one.
// A classic script (not a module) so older iPhones can run it.

const VERSION = "__VERSION__";
const CACHE = `meals-${VERSION}`;
// How long a page may take online before the saved copy is shown instead.
const NETWORK_TIMEOUT_MS = 4000;

// Saved at install: the offline fallback page and what every page loads.
// Static files carry the release in their URL (as the pages ask for them),
// so this cache can never be filled with a previous release's copy.
const PRECACHE = [
  "/offline",
  ...[
    "/static/app.css",
    "/static/winterbottom.css",
    "/static/winterbottom-theme.js",
    "/static/winterbottom-icons.svg",
    "/static/swipe.js",
    "/static/share.js",
    "/static/offline.js",
  ].map((path) => `${path}?v=${VERSION}`),
  "/icons/icon-192.png",
];
// Also saved at install, best effort, so they work offline before a visit.
const WARM_PAGES = ["/", "/history"];

function isPage(url) {
  return (
    url.pathname === "/" ||
    url.pathname === "/history" ||
    /^\/week\/\d{4}-\d{2}-\d{2}$/.test(url.pathname)
  );
}

function isAsset(url) {
  return (
    url.pathname.startsWith("/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/dish-images/") ||
    url.pathname.startsWith("/plan-images/")
  );
}

// Only a plain 200 from this site is saved. A redirect (the sign-in proxy
// sending an expired session to Microsoft) or an error page never is.
function isCacheable(response) {
  return Boolean(
    response &&
    response.ok &&
    response.type === "basic" &&
    !response.redirected,
  );
}

async function save(request, response) {
  if (!isCacheable(response)) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
  } catch {
    // Storage full or unavailable: the page still works online.
  }
}

// The fresh page when it arrives in time, else the saved copy, else the
// offline page. A slow response that loses the race still refreshes the copy.
async function networkFirst(request) {
  const network = fetch(request)
    .then((response) => {
      save(request, response.clone());
      return response;
    })
    .catch(() => null);
  const saved = await caches.match(request);
  if (!saved) {
    return (
      (await network) || (await caches.match("/offline")) || Response.error()
    );
  }
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS),
  );
  return (await Promise.race([network, timeout])) || saved;
}

async function cacheFirst(request) {
  const saved = await caches.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  save(request, response.clone());
  return response;
}

async function clearAll() {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      await Promise.all(
        WARM_PAGES.map((path) =>
          fetch(path)
            .then((response) => save(path, response))
            .catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("meals-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Signing out also removes the plans saved on this phone. The request
  // itself goes to the sign-in proxy untouched.
  if (url.pathname === "/oauth2/sign_out") {
    event.waitUntil(clearAll());
    return;
  }
  if (isPage(url)) event.respondWith(networkFirst(request));
  else if (isAsset(url)) event.respondWith(cacheFirst(request));
});
