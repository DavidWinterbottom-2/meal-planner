// Runs the real service worker script in a sandbox with fake caches and
// fetch, and drives its fetch handler. The browser-level behaviour (saved
// pages really load with the network off) is covered by the e2e suite.
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import vm from "node:vm";
import { serviceWorkerScript } from "../../src/viewer-app.js";

const ORIGIN = "https://meals.winterbottom.xyz";

function res(body, { status = 200, type = "basic", redirected = false } = {}) {
  return {
    body,
    status,
    ok: status >= 200 && status < 300,
    type,
    redirected,
    clone() {
      return this;
    },
  };
}

function makeWorker({ network = {} } = {}) {
  const stores = new Map(); // cache name -> Map(url -> response)
  const key = (r) => new URL(typeof r === "string" ? r : r.url, ORIGIN).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(r, response) {
          store.set(key(r), response);
        },
        async addAll(paths) {
          for (const p of paths) store.set(key(p), res(`pre:${p}`));
        },
      };
    },
    async match(r) {
      for (const store of stores.values()) {
        if (store.has(key(r))) return store.get(key(r));
      }
      return undefined;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
  const fetchMock = vi.fn(async (r) => {
    const outcome = network[new URL(key(r)).pathname];
    if (outcome === undefined || outcome === "offline") {
      throw new TypeError("Failed to fetch");
    }
    if (outcome === "slow") return new Promise(() => {});
    return outcome;
  });
  const listeners = {};
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (name, fn) => (listeners[name] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(serviceWorkerScript("9.9.9"), {
    self,
    caches,
    fetch: fetchMock,
    URL,
    Promise,
    Response: {
      error: () => res("network error", { status: 0, type: "error" }),
    },
    setTimeout: (...args) => globalThis.setTimeout(...args),
  });

  // Dispatch a fetch event; resolves to the response, or null if the worker
  // let the request go to the network untouched.
  async function request(path, { method = "GET", origin = ORIGIN } = {}) {
    let responded = null;
    const waits = [];
    listeners.fetch({
      request: { url: new URL(path, origin).href, method },
      respondWith: (p) => (responded = p),
      waitUntil: (p) => waits.push(p),
    });
    await Promise.all(waits);
    return responded ? await responded : null;
  }
  async function lifecycle(name) {
    const waits = [];
    listeners[name]({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  }
  return { request, lifecycle, stores, caches, fetchMock, network };
}

describe("service worker", () => {
  test("the release version names the cache", () => {
    expect(serviceWorkerScript("1.2.3")).toContain('"1.2.3"');
    expect(serviceWorkerScript("1.2.3")).not.toContain("__VERSION__");
  });

  test("install precaches the shell and warms the pages; activate drops old caches", async () => {
    const w = makeWorker({
      network: { "/": res("home"), "/history": res("history") },
    });
    w.stores.set("meals-0.0.1", new Map());
    w.stores.set("other-app", new Map());
    await w.lifecycle("install");
    await w.lifecycle("activate");
    expect([...w.stores.keys()].sort()).toEqual(["meals-9.9.9", "other-app"]);
    expect((await w.caches.match("/offline")).body).toBe("pre:/offline");
    expect((await w.caches.match("/")).body).toBe("home");
    expect((await w.caches.match("/history")).body).toBe("history");
  });

  test("online, a page comes fresh from the network and is saved", async () => {
    const w = makeWorker({ network: { "/week/2026-10-12": res("fresh") } });
    expect((await w.request("/week/2026-10-12")).body).toBe("fresh");
    expect((await w.caches.match("/week/2026-10-12")).body).toBe("fresh");
  });

  test("offline, a saved page is shown", async () => {
    const w = makeWorker({ network: { "/week/2026-10-12": res("v1") } });
    await w.request("/week/2026-10-12");
    w.network["/week/2026-10-12"] = "offline";
    expect((await w.request("/week/2026-10-12")).body).toBe("v1");
  });

  test("offline, an unsaved page falls back to the offline page", async () => {
    const w = makeWorker();
    await w.lifecycle("install");
    expect((await w.request("/week/2027-01-04")).body).toBe("pre:/offline");
  });

  test("offline with nothing saved at all is a network error", async () => {
    const w = makeWorker();
    expect((await w.request("/history")).type).toBe("error");
  });

  describe("slow network", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test("the saved copy is shown after 4s", async () => {
      const w = makeWorker({ network: { "/": res("v1") } });
      await w.request("/");
      w.network["/"] = "slow";
      const pending = w.request("/");
      await vi.advanceTimersByTimeAsync(4000);
      expect((await pending).body).toBe("v1");
    });
  });

  test("a sign-in redirect or an error page is passed through, never saved", async () => {
    const w = makeWorker({
      network: {
        "/": res("", { status: 0, type: "opaqueredirect" }),
        "/history": res("oops", { status: 500 }),
        "/week/2026-10-12": res("x", { redirected: true }),
      },
    });
    expect((await w.request("/")).type).toBe("opaqueredirect");
    expect((await w.request("/history")).status).toBe(500);
    await w.request("/week/2026-10-12");
    expect(await w.caches.match("/")).toBeUndefined();
    expect(await w.caches.match("/history")).toBeUndefined();
    expect(await w.caches.match("/week/2026-10-12")).toBeUndefined();
  });

  test("dish pictures are cache-first, so they show offline", async () => {
    const w = makeWorker({
      network: { "/dish-images/0123456789abcdef.png": res("png") },
    });
    expect((await w.request("/dish-images/0123456789abcdef.png")).body).toBe(
      "png",
    );
    w.network["/dish-images/0123456789abcdef.png"] = "offline";
    expect((await w.request("/dish-images/0123456789abcdef.png")).body).toBe(
      "png",
    );
  });

  test("static files are cache-first", async () => {
    const w = makeWorker({ network: { "/static/app.css": res("css v1") } });
    expect((await w.request("/static/app.css")).body).toBe("css v1");
    w.network["/static/app.css"] = res("css v2");
    expect((await w.request("/static/app.css")).body).toBe("css v1");
    expect(w.fetchMock).toHaveBeenCalledTimes(1);
  });

  test("signing out clears every saved page and lets the request through", async () => {
    const w = makeWorker({ network: { "/": res("home") } });
    await w.request("/");
    expect(await w.request("/oauth2/sign_out")).toBeNull();
    expect(await w.caches.keys()).toEqual([]);
  });

  test("other requests are left alone", async () => {
    const w = makeWorker();
    expect(await w.request("/week/2026-10-12", { method: "POST" })).toBeNull();
    expect(
      await w.request("/script.js", {
        origin: "https://umami.winterbottom.xyz",
      }),
    ).toBeNull();
    expect(await w.request("/manifest.webmanifest")).toBeNull();
    expect(await w.request("/oauth2/callback")).toBeNull();
  });
});
