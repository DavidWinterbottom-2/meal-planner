# Design

## Context

The original brief suggested a headless Chromium screenshot. The grill-me session rejected it for the Pi: a large arm64 image, high RAM per render and slow cold starts. The viewer (`add-week-viewer`) already produces a pure `buildWeekView` model, and the image reuses it.

## Goals / Non-Goals

**Goals:**

- No browser.
- Render in under 1 s on the Pi.
- Text wraps correctly, and the image matches the design-system palette.

**Non-Goals:**

- Pixel-identical parity with the HTML page.
- A dark-mode PNG. The image is always light, because it's shared to others.

## Decisions

**satori to SVG, then resvg to PNG.** satori does flexbox layout and text wrapping and emits SVG. `@resvg/resvg-js` rasterises it with a prebuilt linux-arm64 binary. _Alternatives:_

- Hand-built SVG: text wrapping would mean writing a text measurer. Rejected.
- node-canvas: needs cairo native builds on arm64. Rejected.
- Chromium: rejected in the grill-me session.

**Fonts are bundled.** satori needs the font bytes, and the slim image has no system fonts. Ship one open-licence sans family (regular plus bold, as WOFF or TTF) under `assets/fonts/`, matching the design system's font stack as closely as licensing allows.

**The layout is a pure function.** `buildImageTree(view)` turns the week view model into satori's element tree, and is unit-testable without rendering. Rendering is a thin wrapper.

**No cache.** Render on every request. One user opens a few images a week, and a render under 1 s on the Pi is acceptable. A cache keyed on `updated_at` would also be wrong after an undo restores an older `updated_at`, so it would need a content hash; that complexity buys nothing at this traffic. Add one only if the measured render time says so.

**Route order.** Register `GET /week/:date.png` before `GET /week/:date`, and have `/week/:date` reject anything that isn't `YYYY-MM-DD`, so `/week/2026-10-12.png` can never be read as a week page.

**Share.** A small client script fetches the PNG as a Blob, builds a `File`, and if `navigator.canShare({files})` is true calls `navigator.share({files, title})`. Otherwise it triggers a download via an `<a download>`. The PNG fetch uses the session cookie (same origin).

## Risks / Trade-offs

- [Text measurement or emoji in meal names render oddly] → Bundle a font with wide Latin coverage including umlauts (Älplermagronen, rösti) and test with the seed data. Emoji are out of scope.
- [resvg or satori behave differently on arm64] → Run a render test in the arm64 image build (QEMU) in CI.
- [iOS share-sheet file support differs between versions] → The download fallback always works, and David checks this on the phone.
