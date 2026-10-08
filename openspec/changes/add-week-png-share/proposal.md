# Proposal

## Why

Lisa gets plans on WhatsApp as images. The viewer sits behind David's login, so a link is useless to her; she needs the picture itself. A clean table image of the week, shared straight from the phone's share sheet, replaces screenshotting and cropping.

## What Changes

- `/week/YYYY-MM-DD.png`: a rendered image of the week as a table (Day | Lunch | Snacks | Dinner | Notes) with the week heading, source label and prep, in the design-system palette, readable when viewed on a phone in WhatsApp.
- It renders without a browser (layout to SVG, then rasterised to PNG). It is cached until the week changes.
- A **Share** button on each planned week's page. It opens the phone's share sheet with the PNG file attached (Web Share API with files), and falls back to downloading the PNG.
- The PNG route sits behind the viewer login like every other page. No public URLs.

## Non-goals

- Public or signed image links. `get_week_links` stays dropped.
- An MCP tool returning the PNG (Claude reads the data instead).
- A headless browser.

## Capabilities

### New Capabilities

- `week-image-export`: the shareable PNG rendering of a week, its caching, and the Share action.

### Modified Capabilities

None. The Share button is specified here, so `week-viewer` stays unchanged.

## Impact

- New dependencies: `satori` (layout to SVG), `@resvg/resvg-js` (SVG to PNG, prebuilt linux-arm64), and a bundled font file (fonts must be shipped in the image).
- New route and an in-memory cache keyed by `week_start` and `updated_at`.
- Depends on `add-week-viewer` (auth and pages).
