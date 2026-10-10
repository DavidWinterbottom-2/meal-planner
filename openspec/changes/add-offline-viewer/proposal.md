# Proposal

## Why

The viewer needs a connection on every open. In a basement kitchen, a supermarket or on a train, the home-screen app shows a browser error instead of the week. The plan barely changes during a week, so a copy saved on the phone is nearly always good enough.

## What Changes

- A service worker (`/sw.js`) saves each viewer page when it's opened online, plus the current week and history at install. With no connection, or no answer within 4 s, the saved copy is shown.
- A banner says the page is the saved copy while the phone is offline.
- A page that was never saved shows an "offline" page instead of a browser error.
- A saved page opened on a later day re-marks today and the past days from the phone's clock.
- Signing out deletes everything saved on the phone.

## Non-goals

- Editing offline: the viewer stays read-only.
- Syncing in the background or pre-fetching every week.
- Offline for the MCP listener.

## Capabilities

### New Capabilities

- `offline-viewer`: saving viewer pages on the phone and showing them without a connection.

### Modified Capabilities

None. The week pages render as before; the day rows gain a `data-date` attribute and a hidden Today pill so the page script can re-mark them.

## Impact

- New files `src/web/static/sw.js` and `src/web/static/offline.js`; new routes `/sw.js` and `/offline` on the viewer listener only.
- Plan data now stays on the phone until sign-out. It is David's and Lisa's own phones, behind the same login.
- No docker-infra change: `/sw.js` and `/offline` sit behind the login like the pages.
