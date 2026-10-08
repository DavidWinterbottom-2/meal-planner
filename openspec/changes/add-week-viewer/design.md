# Design

## Context

The store, week resolution and `listWeeks` come from `add-meal-plan-store-and-mcp`; the container already runs on the Pi (`deploy-mcp-to-home-docker`). The docker-infra precedent for in-app Entra login is `my-sweepy`. Its env contract is `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `ALLOWED_EMAILS`, `SESSION_SECRET`, `OIDC_REDIRECT_URI` and `AUTH_DISABLED`, and it refuses to start when misconfigured. The design system lives in `docker-infra/design-system/` (`winterbottom.css`, `winterbottom-theme.js`, `winterbottom-icons.svg`, `LOOK-AND-FEEL.md`).

## Goals / Non-Goals

**Goals:**

- Server-rendered HTML with near-zero client JS: only swipe and theme handling.
- The same Entra env contract as my-sweepy, so `entra-app-registration` and `promote-to-service` apply unchanged.
- Prove the riskiest assumption (iOS standalone and OIDC) before building pages.

**Non-Goals:** a service worker or offline mode, client-side routing.

## Decisions

**Spike first: iOS standalone with Entra.**

- Build only the login flow and a stub page, deploy, and install to the home screen on iPhone and Android.
- Pass criteria: login completes and returns into the standalone app, and the app stays logged in after being closed, after a phone restart and after a container restart.
- **Fallback if iOS fails:** device pairing. Log in once in Safari, and a `/pair` page shows a one-time 6-digit code (valid for 5 minutes). The standalone app's `/pair/enter` form exchanges the code for the same 1-year session cookie in the standalone app's own cookie store. The task breakdown includes this fallback as a conditional group.

**Sessions as signed, stateless cookies.** The session is an HMAC-signed cookie holding `{email, exp}`, with `exp` extended on each request (sliding, refreshed at most daily), so a container restart keeps you logged in and needs no session store. _Alternative:_ express-session with a SQLite store. More moving parts, and no revocation need for one user. Revocation means rotating `SESSION_SECRET`.

**`openid-client`** for authorization-code + PKCE against `login.microsoftonline.com/<tenant>/v2.0`. The email comes from the `preferred_username` or `email` claim and is compared case-insensitively.

**Host split.** One app serves both hosts. On `meals.winterbottom.xyz` the Apache vhost denies `/mcp`, `/oauth/` and `/.well-known/oauth-*` (`Require all denied`), so the MCP surface is reachable only via `mcp.winterbottom.xyz/meals/`. The viewer's auth middleware applies whatever the host, so a viewer route reached through the mcp host still needs a session.

**Rendering.** Tagged-template HTML functions (`renderWeek(model)`, `renderHistory`, `renderEmpty`) take a plain view model built by a pure `buildWeekView(week, today)`, which computes the badge, today flag, Kita label and source label. Both are unit-testable without HTTP. _Alternative:_ a template engine. It's unnecessary for 4 small pages.

**Swipe.** A small inline script with touchstart/touchend. It navigates when |dx| > 60px and |dx| > 2·|dy|, which separates a swipe from scrolling. Prev and Next remain real links, so the page works without JS.

**Design system.** Vendor `winterbottom.css` and `winterbottom-theme.js` via the `design-system-sync` skill. Dinner gets a larger type token, and today's row uses the accent-surface token. The custom palette from the brief is not used.

**tools-index.** One service, one entry. Switch the entry to `match: "meals.winterbottom.xyz"`, `auth: "entra-app"`. The public tools page keeps a card for the viewer, and the MCP endpoint is listed in the card's description. The MCP surface's auth is documented in the service README. _Open question below._

## Risks / Trade-offs

- [iOS standalone OIDC fails] → The spike runs first; the device-pairing fallback is pre-designed.
- [A 1-year stateless cookie can't be revoked individually] → Rotating `SESSION_SECRET` revokes all sessions. That's acceptable for a single user.
- [The tools-index entry no longer names the MCP's `mcp` auth] → `check-hosting-security` sees `entra-app`, but the `/meals/mcp` path is still protected by the shared OAuth. Recorded in the service README.

## Migration Plan

1. Create the DNS record (`cloudflare-dns` skill) and the Entra app (`entra-app-registration` skill, redirect `https://meals.winterbottom.xyz/auth/callback`).
2. Add the vhost and the `.env` additions.
3. Deploy the spike, then the full viewer.

Rollback: remove the vhost; the MCP is unaffected.

## Open Questions

- Does docker-infra's `check-hosting-security` / tools-index support a second entry or a secondary `auth` for one service exposing two surfaces? If it does, register both. If not, the single `entra-app` entry stands. Either way, nothing here changes.
