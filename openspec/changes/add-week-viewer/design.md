# Design

## Context

The store, week resolution and `listWeeks` come from `add-meal-plan-store-and-mcp`; the container already runs on the Pi (`deploy-mcp-to-home-docker`). The docker-infra precedent for login in front of an app is Hermes: the `entra-auth-proxy` image (oauth2-proxy with Entra defaults baked in) runs as a sidecar, is the only published port, and forwards to the app over the `docker-infra` network. Its settings are `OAUTH2_PROXY_*` env vars marked required with `:?` in compose. The hosting-security vocabulary calls this `entra-proxy`. (The grill-me session originally chose in-app login, `entra-app`. David switched it to the sidecar on 2026-10-09 so the app carries no login code.) The design system lives in `docker-infra/design-system/` (`winterbottom.css`, `winterbottom-theme.js`, `winterbottom-icons.svg`, `LOOK-AND-FEEL.md`).

## Goals / Non-Goals

**Goals:**

- Server-rendered HTML with near-zero client JS: only swipe and theme handling.
- No login code in the app: reuse the `entra-auth-proxy` sidecar exactly as Hermes does.
- The MCP surface never passes through the sidecar; claude.ai's OAuth (dynamic registration plus PKCE) is something oauth2-proxy cannot do.
- Check the riskiest assumption (iOS standalone and OIDC) early, so the README's phone steps are right.

**Non-Goals:** a service worker or offline mode, client-side routing.

## Decisions

**Sidecar, not in-app login.** `entra-auth-proxy` (oauth2-proxy) sits in front of the viewer only:

- `meals.winterbottom.xyz` → Apache → sidecar (published port) → app's **viewer listener** (`VIEWER_PORT`, default 3001, `expose`d on the docker network, never published).
- `mcp.winterbottom.xyz/meals/` → Apache → app's **MCP listener** (port 3000, published only to Apache per change 2). This listener serves only `/mcp`, `/oauth/*`, `/.well-known/*` and `/health`.
- One process, two Express apps on two ports. A viewer route simply does not exist on the MCP listener, and MCP routes don't exist on the viewer listener, so neither surface can leak into the other even if Apache is misconfigured. _Alternative:_ one port with `--skip-auth-route` on the proxy and path rules in Apache. Rejected: it relies on two configs staying in sync to keep plan data private.
- Sidecar settings follow Hermes:
  - `OAUTH2_PROXY_UPSTREAMS=http://meal-planner:3001`
  - `OAUTH2_PROXY_REDIRECT_URL=https://meals.winterbottom.xyz/oauth2/callback`
  - client ID and secret, cookie secret
  - allow-list via `OAUTH2_PROXY_AUTHENTICATED_EMAILS_FILE`, a mounted file containing only David's address. `EMAIL_DOMAINS=*` alone would admit anyone in the tenant.
  - `OAUTH2_PROXY_COOKIE_EXPIRE=8760h` (1 year) and `OAUTH2_PROXY_COOKIE_SAMESITE=lax`. Provider, issuer, cookie-secure, scope and the unverified-email trust are baked into the `entra-auth-proxy` image, so they aren't repeated here (HOSTING-SECURITY §H3)
  - `OAUTH2_PROXY_SKIP_AUTH_ROUTES` for `^/manifest\.webmanifest$` and `^/icons/`, so the home-screen install works before login.
- The cookie is encrypted by the sidecar and carries the session itself, so a container restart doesn't log you out.
- The app trusts nothing from the sidecar's headers; it just serves whoever reaches the viewer port. That keeps it off the host and the LAN because the viewer port is unpublished. Other containers on the flat `docker-infra` network can still reach it; David accepted that for v1 (read-only pages), and `add-lisa-image-upload` closes it before adding writes.

**Verify early: iOS standalone with the sidecar login.** This is a verification, not a gate: no page or route depends on its outcome, because the fallback needs no app code. It runs early only so a fallback is known before the phone instructions are written.

- Deploy the sidecar in front of a stub viewer page plus the manifest and icons, then install to the home screen on iPhone and Android.
- Pass criteria: login completes and returns into the standalone app, and it stays logged in after closing the app, restarting the phone and restarting the containers.
- **[Guessing]** whether oauth2-proxy keeps the session for the full cookie lifetime without a refresh token, or expires it when Entra's ID token does (about 1 hour). The spike checks a session that has been idle for more than 2 hours. If it expires early, enable `OAUTH2_PROXY_COOKIE_REFRESH` with the `offline_access` scope, so the sidecar refreshes silently.
- **Fallback if iOS standalone login fails:** don't build pairing into the app. Open the viewer in Safari as a bookmark instead of an installed app, and record that in the README. Building pairing would mean writing session code in the app again, which is exactly what the sidecar removed.

**Rendering.** Tagged-template HTML functions (`renderWeek(model)`, `renderHistory`, `renderEmpty`) take a plain view model built by a pure `buildWeekView(week, today)`, which computes the badge, today flag, Kita label and source label. Both are unit-testable without HTTP. _Alternative:_ a template engine. It's unnecessary for 4 small pages.

**Swipe.** A small inline script with touchstart/touchend. It navigates when |dx| > 60px and |dx| > 2·|dy|, which separates a swipe from scrolling. Prev and Next remain real links, so the page works without JS.

**Analytics (REPO-STANDARDS §11).** A pure `analyticsTag(env)` returns the Umami `<script defer src=… data-website-id=…>` only when both `ANALYTICS_SCRIPT_URL` and `ANALYTICS_WEBSITE_ID` are set (attribute-escaped), otherwise an empty string. Every viewer page's `<head>` includes its result. The app gets its own website in Umami. Umami is cookieless and first-party, so it doesn't interfere with the sidecar's cookie. Page paths like `/week/2026-10-12` are the only data sent, and they aren't sensitive. No `identify()` call is made, per HOSTING-SECURITY §H5.

**Design system.** Vendor `winterbottom.css` and `winterbottom-theme.js` via the `design-system-sync` skill. Dinner gets a larger type token, and today's row uses the accent-surface token. The custom palette from the brief is not used.

**tools-index.** One service, one entry. Switch the entry to `match: "meals.winterbottom.xyz"`, `auth: "entra-proxy"`. The public tools page keeps a card for the viewer, and the MCP endpoint is listed in the card's description. The MCP surface's auth is documented in the service README. _Open question below._

## Risks / Trade-offs

- [iOS standalone login fails] → The spike runs first; the fallback is a Safari bookmark, not new app code.
- [The session expires with Entra's ID token instead of after a year] → Checked in the spike; cookie refresh is the fix.
- [The allow-list is left at `EMAIL_DOMAINS=*`] → The compose file mounts an authenticated-emails file, and the spike checks that a second tenant account is refused.
- [A 1-year cookie can't be revoked individually] → Rotating the cookie secret revokes all sessions. That's acceptable for a single user.
- [The tools-index entry no longer names the MCP's `mcp` auth] → `check-hosting-security` sees `entra-proxy`, but the `/meals/mcp` path is still protected by the shared OAuth. Recorded in the service README.

## Migration Plan

1. Create the DNS record (`cloudflare-dns` skill) and an Entra app for the sidecar (redirect `https://meals.winterbottom.xyz/oauth2/callback`).
2. Add the sidecar to the meals compose file, the vhost pointing at it, and the `.env` additions.
3. Deploy the spike, then the full viewer.

Rollback: remove the vhost; the MCP is unaffected.

## Open Questions

- Does docker-infra's `check-hosting-security` / tools-index support a second entry or a secondary `auth` for one service exposing two surfaces? If it does, register both. If not, the single `entra-proxy` entry stands. Either way, nothing here changes.
