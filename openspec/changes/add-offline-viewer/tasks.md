# Tasks

## 1. Service worker

- [x] 1.1 Add `src/web/static/sw.js`: pages network-first with a 4 s fallback to the saved copy and `/offline`; static files cache-first; only same-origin non-redirected 200s saved; precache the shell, warm `/` and `/history`; versioned cache, old caches dropped on activate; sign-out clears all. Verify `test/web/sw.test.js` runs the real script in a sandbox for each case. **Done:** 11 tests
- [x] 1.2 Serve it at `/sw.js` (version substituted, `no-cache`) and add the `/offline` page, both on the viewer listener only. Verify route tests, including 404 on the MCP listener. **Done**

## 2. Page

- [x] 2.1 Add `src/web/static/offline.js` to every page: register the worker, show the offline banner, re-mark today and past days from the Zurich date. Rows carry `data-date` and a hidden Today pill. Verify unit tests of the date helpers and render tests. **Done**

## 3. Verification and release

- [x] 3.1 Add an e2e test: open a week online, cut the page and the worker off the network, reload, and check the week and the banner; an unsaved week shows the offline page. **Done:** passes locally against `npm start`; `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS` set in `playwright.config.js`
- [x] 3.2 README and `npm version minor`; lint and unit tests (coverage ≥80%) pass. **Done:** 0.4.0, 193 unit tests at 94.6%
- [ ] 3.3 On the phone after deploy: open the week online, switch to flight mode, reopen the home-screen app; the week and the banner show. Then sign out and check that offline shows the browser's or the offline page, not the week
