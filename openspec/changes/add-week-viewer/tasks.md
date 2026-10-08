# Tasks

## 1. Infra for the viewer host

- [ ] 1.1 Create `meals.winterbottom.xyz` with the `cloudflare-dns` skill. Verify that `dig meals.winterbottom.xyz` resolves to the Pi
- [ ] 1.2 Register the Entra app with the `entra-app-registration` skill (redirect `https://meals.winterbottom.xyz/auth/callback`, `ALLOWED_EMAILS` = David only). Verify that the env values are in the Pi `.env` and Bitwarden
- [ ] 1.3 In docker-infra, add the `meals.winterbottom.xyz` :80/:443 vhost proxying to 8099, with `Require all denied` on `/mcp`, `/oauth/` and `/.well-known/oauth-`, and add the Entra env vars to the compose file. Verify that `httpd -t` passes and that `https://meals.winterbottom.xyz/mcp` returns 403

## 2. Spike: Entra login in a home-screen app

- [ ] 2.1 Implement the signed sliding-session cookie helpers (`sign`, `verify`, `refresh`, 1-year sliding, `Secure`/`HttpOnly`/`SameSite=Lax`). Verify unit tests for tamper rejection, expiry and daily refresh
- [ ] 2.2 Implement the OIDC login (`/login`, `/auth/callback`, `/logout`, allow-list check, return-to URL) and startup config validation (fail closed, `AUTH_DISABLED`). Verify unit tests for the allow-list (case-insensitive), the 403 path, and a missing-setting startup error
- [ ] 2.3 Serve a stub protected `/` page and the manifest and icons, then deploy. Verify on iPhone and Android that install to home screen → login → return into the standalone app works, and that it stays logged in after closing the app, restarting the phone and restarting the container. Record the outcome in `docs/spikes/ios-standalone-login.md`

## 3. Fallback: device pairing (only if 2.3 fails on iOS)

- [ ] 3.1 Implement `/pair` (shows a one-time 6-digit code, 5 minute TTL, after login in Safari) and `/pair/enter` (the standalone app exchanges the code for the session cookie), with codes single-use and rate-limited. Verify unit tests for expiry, reuse and brute-force limits, and repeat the 2.3 phone checks

## 4. Viewer pages

- [ ] 4.1 Vendor the design system with the `design-system-sync` skill. Verify that the vendored files match `docker-infra/design-system`
- [ ] 4.2 Implement `buildWeekView(week, today)`: heading text, relative badge, today flag, Kita label, source label, empty state. Verify unit tests for each week-viewer scenario (badge values, Sunday, Kita, source, empty)
- [ ] 4.3 Implement the `/`, `/week/:date` (redirect to Monday, 404 for invalid) and `/history` routes, and the HTML renderers. Verify route tests on an ephemeral port with `AUTH_DISABLED` and seeded data
- [ ] 4.4 Add the swipe script (|dx| > 60px and > 2·|dy|) and Prev, This week and Next links. Verify a unit test of the gesture classifier and a manual check on phone
- [ ] 4.5 Style the day rows (prominent dinner, smaller lunch and snacks, italic notes, today highlight), the prep block, light and dark themes. Verify no horizontal scroll at 390px (Playwright screenshot in both themes, attached to the PR)
- [ ] 4.6 Add the manifest (`standalone`, `start_url: /`, a 180px Apple touch icon, a 512px icon). Verify that the manifest test passes and Chrome DevTools reports it installable

## 5. Registration, docs and release

- [ ] 5.1 In docker-infra, update the tools-index entry to `match: "meals.winterbottom.xyz"`, `auth: "entra-app"`, update the tools-page card, and the service README (both hosts, auth per surface). Verify that all three docker-infra checks pass
- [ ] 5.2 Update the README for the viewer URL, phone install steps and auth env vars. Verify that the steps match the spike outcome
- [ ] 5.3 `npm version minor`, then verify that `npm run lint` and `npm test` (coverage ≥80%) pass

## Workflow follow-up

- Archive after deploy and on-phone verification.
