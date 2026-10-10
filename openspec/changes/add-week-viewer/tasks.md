# Tasks

## 1. Infra for the viewer host

- [ ] 1.1 Create `meals.winterbottom.xyz` with the `cloudflare-dns` skill. Verify that `dig meals.winterbottom.xyz` resolves to the Pi
- [ ] 1.2 Register an Entra app for the sidecar (redirect `https://meals.winterbottom.xyz/oauth2/callback`), following how Hermes' `entra-auth-proxy` app is set up. Verify that the client ID, secret and a new cookie secret (`openssl rand -base64 32 | tr -- '+/' '-_'`) are in the Pi `.env` and Bitwarden
- [x] 1.3 In docker-infra's meal-planner service, add the `entra-auth-proxy` sidecar, copying Hermes' block. Settings: upstream `http://meal-planner:3001`, the redirect URL, an authenticated-emails file mounted with David's address only, `COOKIE_EXPIRE=8760h`, `COOKIE_SAMESITE=lax` (nothing the image already bakes in, per HOSTING-SECURITY §H3), and skip-auth routes for the manifest and icons. Publish only the sidecar's port, on the next free host port, and `expose` 3001 on the app without publishing it. Verify that `docker compose config` parses and that port 3001 is not published on the host. **Done:** sidecar `meal-planner-auth` with **no host port** (Apache reaches it by container name; see design), `EMAIL_DOMAINS` overridden so the generated, git-ignored emails file alone decides, skip-auth for the manifest and icons. `check-compose.sh` passes and compose renders no published ports
- [x] 1.4 Add the `meals.winterbottom.xyz` :80/:443 vhost proxying to the sidecar's port. Verify that `httpd -t` passes. **Done:** vhost proxies to `http://meal-planner-auth:4180` with `disablereuse=On`; `httpd -t` passes with both the `mcp` and `meals` blocks. The Pi's wildcard certificate covers the name

## 2. Viewer listener and login verification in a home-screen app

- [x] 2.1 Add the viewer listener: a second Express app on `VIEWER_PORT` (default 3001) in the same process, serving only viewer routes and static files. The MCP listener keeps only `/mcp`, `/oauth/*`, `/.well-known/*` and `/health`. Verify route tests that the MCP listener returns 404 for `/week/...` and `/history`, and that the viewer listener returns 404 for `/mcp` and `/oauth/register`. **Done:** `createViewerApp` on `VIEWER_PORT`; route tests show the MCP listener 404s every viewer path and the viewer listener 404s `/mcp`, `/oauth/*` and `/.well-known/*`
- [ ] 2.2 Serve a stub `/` page, the manifest and the icons on the viewer listener, then deploy with the sidecar. Verify on iPhone and Android:
  - install to home screen → login → return into the standalone app works
  - it stays logged in after closing the app, after restarting the phone, after restarting the containers, and after more than 2 hours idle
  - a second Microsoft account in the tenant is refused
  - `https://mcp.winterbottom.xyz/meals/week/2026-10-12` is not served

  Record the outcome in `docs/spikes/ios-standalone-login.md`. If the idle session expires early, enable cookie refresh with `offline_access` and re-check. If iOS standalone login fails outright, use the Safari-bookmark fallback from the design and say so in the README

## 3. Viewer pages

- [x] 3.1 Vendor the design system with the `design-system-sync` skill. Verify that the vendored files match `docker-infra/design-system`. **Done:** both files copied from docker-infra `280c398`, byte-identical, and excluded from Prettier/ESLint so they stay that way
- [x] 3.2 Implement `buildWeekView(week, today)`: heading text, relative badge, today flag, Kita label, source label, empty state. Verify unit tests for each week-viewer scenario (badge values, Sunday, Kita, source, empty). **Done:** plus `weekBadge`, `weekHeading`, `lunchLabel`, `sourceLabel` and `buildHistoryView`, unit-tested per scenario. Month names now come from a fixed table: ICU gave "Sept" on some versions
- [x] 3.3 Implement the `/`, `/week/:date` (redirect to Monday, 404 for invalid) and `/history` routes, the HTML renderers, and a sign-out link to the sidecar's `/oauth2/sign_out`. Verify route tests on the viewer listener with seeded data. **Done:** route tests cover the current week, Sunday, the Zurich day boundary, redirect, invalid dates, empty week and history order; pages also send a CSP and `no-store`
- [ ] 3.4 Add the swipe script (|dx| > 60px and > 2·|dy|) and Prev, This week and Next links. Verify a unit test of the gesture classifier and a manual check on phone
- [x] 3.5 Style the day rows (prominent dinner, smaller lunch and snacks, italic notes, today highlight), the prep block, light and dark themes. Verify no horizontal scroll at 390px (Playwright screenshot in both themes, attached to the PR). **Done:** Playwright checks no horizontal scroll at 390px on four pages in both themes; screenshots are the CI `viewer-screenshots` artifact. Sign-out moved to the footer so the header fits one line on a phone
- [x] 3.5a Implement `analyticsTag(env)` and include it in every viewer page's `<head>`. Add `ANALYTICS_SCRIPT_URL` / `ANALYTICS_WEBSITE_ID` (empty) to `.env.example`. Verify unit tests for both-set, half-set and unset, attribute escaping, and that no page contains any other script `src` host. **Done:** unit tests for both-set, half-set, unset and escaping; a render test checks the only external script host is the configured one, and the CSP allows only that origin
- [ ] 3.5b Add an `e2e` CI job: build the image, start it with dummy env, and drive both listeners with Playwright (the viewer pages render seeded weeks on 3001; `/mcp` rejects an unauthenticated call and `/week/...` is 404 on 3000). Verify the job is green and required on PRs
- [x] 3.6 Add the manifest (`standalone`, `start_url: /`, a 180px Apple touch icon, a 512px icon) under the paths the sidecar lets through without login. Verify that the manifest test passes and Chrome DevTools reports it installable. **Done:** Chromium's DevTools reports no manifest or installability errors, now an e2e test

## 4. Registration, docs and release

- [x] 4.1 In docker-infra, update the tools-index entry to `match: "meals.winterbottom.xyz"`, `auth: "entra-proxy"`, update the tools-page card, and the service README (both hosts, auth per surface, the sidecar). Verify that all three docker-infra checks pass. **Done:** `entra-proxy`, `match: meals.winterbottom.xyz`, a card on the public tools page, service and home-docker READMEs; all docker-infra checks pass locally
- [ ] 4.1a Create a "Meal Planner" website in Umami and set `ANALYTICS_SCRIPT_URL=https://umami.winterbottom.xyz/script.js` and `ANALYTICS_WEBSITE_ID` in the Pi `.env` and the docker-infra compose and `.env.example`. Verify that a page view from the phone appears in the Umami dashboard
- [ ] 4.2 Update the README for the viewer URL, phone install steps, `VIEWER_PORT`, how login works (the sidecar, not the app), and the analytics settings. Verify that the steps match the spike outcome
- [x] 4.3 `npm version minor`, then verify that `npm run lint` and `npm test` (coverage ≥80%) pass. **Done:** 0.3.0; lint clean, 174 unit tests at 96.6% coverage, 12 e2e tests

## Workflow follow-up

- Archive after deploy and on-phone verification.
