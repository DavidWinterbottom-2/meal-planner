# Design

## Caching strategy

- **Pages** (`/`, `/week/YYYY-MM-DD`, `/history`): network-first, so an online phone always shows the current plan. If a saved copy exists and the network takes longer than 4 s, the saved copy is shown and the late response still refreshes it. With no saved copy, the network result is awaited; on failure the `/offline` page is shown.
- **Static files** (`/static/*`, `/icons/*`): cache-first. They change only with a release, and each release gets a new cache.
- **Versioning:** the server serves `sw.js` with the `package.json` version substituted, as `meals-<version>`. A new release installs a new worker, which deletes the older `meals-*` caches on activate. `/sw.js` is `Cache-Control: no-cache` so the browser checks for it on each visit.

## What is never saved

Only a same-origin `200` that wasn't redirected. That rules out:

- the sign-in proxy's redirect to Microsoft when the session has expired (an `opaqueredirect` for navigations), which must reach the browser untouched so the user can sign in again
- error pages
- the `/week/<non-Monday>` redirect

Non-GET and cross-origin requests (the Umami script) aren't intercepted.

## Sign-out

The sign-out link goes to the sidecar's `/oauth2/sign_out`. The worker sees that navigation, deletes every cache, and lets the request through. The worker stays registered. With no session, its next page fetch is the sign-in redirect, which it passes on.

## Login proxy

`/sw.js` is fetched with the session cookie like any page, so it needs no skip-auth route. If the session has expired, the browser's update check gets the redirect and keeps the installed worker, which is harmless.

## Stale "today"

A saved page records the day it was rendered. `offline.js` re-marks the rows from the phone clock in Europe/Zurich (the server's day), using each row's `data-date`. Every row carries a hidden Today pill to show. Online this is a no-op, since the server already marked the same day.

## Classic worker

`sw.js` is a classic script, not a module, for older iPhones. Its logic is tested by running the real file in a `vm` sandbox with fake caches and fetch. The browser behaviour is tested by a Playwright test that cuts the page and the worker off from the network. `context.route` reaches worker requests with `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS`, which `setOffline` alone does not.
