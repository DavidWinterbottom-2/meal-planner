# Tasks

## 1. Infra for the viewer host

- [ ] 1.1 Create `meals.winterbottom.xyz` with the `cloudflare-dns` skill. Verify that `dig meals.winterbottom.xyz` resolves to the Pi
- [ ] 1.2 Register an Entra app for the sidecar (redirect `https://meals.winterbottom.xyz/oauth2/callback`), following how Hermes' `entra-auth-proxy` app is set up. Verify that the client ID, secret and a new cookie secret (`openssl rand -base64 32 | tr -- '+/' '-_'`) are in the Pi `.env` and Bitwarden
- [ ] 1.3 In docker-infra's meal-planner service, add the `entra-auth-proxy` sidecar, copying Hermes' block. Settings: upstream `http://meal-planner:3001`, the redirect URL, an authenticated-emails file mounted with David's address only, `COOKIE_EXPIRE=8760h`, `COOKIE_SAMESITE=lax` (nothing the image already bakes in, per HOSTING-SECURITY §H3), and skip-auth routes for the manifest and icons. Publish only the sidecar's port, on the next free host port, and `expose` 3001 on the app without publishing it. Verify that `docker compose config` parses and that port 3001 is not published on the host
- [ ] 1.4 Add the `meals.winterbottom.xyz` :80/:443 vhost proxying to the sidecar's port. Verify that `httpd -t` passes

## 2. Viewer listener and spike: login in a home-screen app

- [ ] 2.1 Add the viewer listener: a second Express app on `VIEWER_PORT` (default 3001) in the same process, serving only viewer routes and static files. The MCP listener keeps only `/mcp`, `/oauth/*`, `/.well-known/*` and `/health`. Verify route tests that the MCP listener returns 404 for `/week/...` and `/history`, and that the viewer listener returns 404 for `/mcp` and `/oauth/register`
- [ ] 2.2 Serve a stub `/` page, the manifest and the icons on the viewer listener, then deploy with the sidecar. Verify on iPhone and Android:
  - install to home screen → login → return into the standalone app works
  - it stays logged in after closing the app, after restarting the phone, after restarting the containers, and after more than 2 hours idle
  - a second Microsoft account in the tenant is refused
  - `https://mcp.winterbottom.xyz/meals/week/2026-10-12` is not served

  Record the outcome in `docs/spikes/ios-standalone-login.md`. If the idle session expires early, enable cookie refresh with `offline_access` and re-check. If iOS standalone login fails outright, use the Safari-bookmark fallback from the design and say so in the README

## 3. Viewer pages

- [ ] 3.1 Vendor the design system with the `design-system-sync` skill. Verify that the vendored files match `docker-infra/design-system`
- [ ] 3.2 Implement `buildWeekView(week, today)`: heading text, relative badge, today flag, Kita label, source label, empty state. Verify unit tests for each week-viewer scenario (badge values, Sunday, Kita, source, empty)
- [ ] 3.3 Implement the `/`, `/week/:date` (redirect to Monday, 404 for invalid) and `/history` routes, the HTML renderers, and a sign-out link to the sidecar's `/oauth2/sign_out`. Verify route tests on the viewer listener with seeded data
- [ ] 3.4 Add the swipe script (|dx| > 60px and > 2·|dy|) and Prev, This week and Next links. Verify a unit test of the gesture classifier and a manual check on phone
- [ ] 3.5 Style the day rows (prominent dinner, smaller lunch and snacks, italic notes, today highlight), the prep block, light and dark themes. Verify no horizontal scroll at 390px (Playwright screenshot in both themes, attached to the PR)
- [ ] 3.5a Implement `analyticsTag(env)` and include it in every viewer page's `<head>`. Add `ANALYTICS_SCRIPT_URL` / `ANALYTICS_WEBSITE_ID` (empty) to `.env.example`. Verify unit tests for both-set, half-set and unset, attribute escaping, and that no page contains any other script `src` host
- [ ] 3.6 Add the manifest (`standalone`, `start_url: /`, a 180px Apple touch icon, a 512px icon) under the paths the sidecar lets through without login. Verify that the manifest test passes and Chrome DevTools reports it installable

## 4. Registration, docs and release

- [ ] 4.1 In docker-infra, update the tools-index entry to `match: "meals.winterbottom.xyz"`, `auth: "entra-proxy"`, update the tools-page card, and the service README (both hosts, auth per surface, the sidecar). Verify that all three docker-infra checks pass
- [ ] 4.1a Create a "Meal Planner" website in Umami and set `ANALYTICS_SCRIPT_URL=https://umami.winterbottom.xyz/script.js` and `ANALYTICS_WEBSITE_ID` in the Pi `.env` and the docker-infra compose and `.env.example`. Verify that a page view from the phone appears in the Umami dashboard
- [ ] 4.2 Update the README for the viewer URL, phone install steps, `VIEWER_PORT`, how login works (the sidecar, not the app), and the analytics settings. Verify that the steps match the spike outcome
- [ ] 4.3 `npm version minor`, then verify that `npm run lint` and `npm test` (coverage ≥80%) pass

## Workflow follow-up

- Archive after deploy and on-phone verification.
