# Proposal

## Why

David wants a button on his phone's home screen that opens straight onto this week's meals, with one tap to the previous or next week. That replaces scrolling WhatsApp for a plan image. The data now exists (via the MCP server); this change adds the read-only page that shows it.

## What Changes

- A phone-first, read-only web viewer on `meals.winterbottom.xyz`. It has:
  - `/` (current week) and `/week/YYYY-MM-DD` (any week)
  - `/history` (all weeks, newest first)
  - Prev, This week and Next buttons, plus swipe navigation
  - today highlighted, dinner prominent, Kita days, the prep block and a source label
  - an empty-week state, and light and dark mode via the shared design system
- A web app manifest and icon, so it installs to the home screen and opens full screen.
- Microsoft Entra login (`entra-app`) on every viewer page, limited to David's email, with a 1-year sliding session that survives container restarts.
- A **spike first**: confirm that Entra login completes inside an iOS home-screen web app (standalone mode) and that the session sticks. Android is checked too.
- Deployment: a Cloudflare DNS record, an Entra app registration, an Apache vhost for `meals.winterbottom.xyz` (blocking `/mcp` and `/oauth/` there), and the tools-index entry and card update.

## Non-goals

- Editing in the web UI, which stays read-only. All edits go through Claude.
- PNG and share (`add-week-png-share`). Showing Lisa's images (`add-lisa-image-upload`).
- Access for Lisa.
- Sunday switching to next week. The view is strictly Mon–Sun.

## Capabilities

### New Capabilities

- `week-viewer`: the pages, navigation, layout rules and installable-app behaviour of the read-only viewer.
- `web-auth`: how the viewer authenticates (Entra, allow-list, long session) and which routes are exempt.

### Modified Capabilities

None.

## Impact

- New code: views and routes in `src/web/`, static assets (vendored `winterbottom.css` / `winterbottom-theme.js`, manifest, icons), and the OIDC login. New dependencies: `openid-client` and a signed-cookie session library.
- docker-infra: a new vhost, DNS, and an Entra app; the tools-index entry changes.
- Depends on `add-meal-plan-store-and-mcp` (store, week resolution) and `deploy-mcp-to-home-docker` (running service).
