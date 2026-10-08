# Design

## Context

The original brief suggested a headless Chromium screenshot. The grill-me session rejected it for the Pi: a large arm64 image, high RAM per render and slow cold starts. The viewer (`add-week-viewer`) already produces a pure `buildWeekView` model, and the image reuses it.

## Goals / Non-Goals

**Goals:**

- No browser.
- Render in under 1 s on the Pi, cached afterwards.
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

**Cache.** An in-memory LRU (about 20 entries) keyed `${week_start}:${updated_at}`. Every write updates `updated_at`, so a stale key is never hit, and no explicit invalidation hook is needed. Deletes and undos change or remove the week, so there's nothing left to serve. A container restart simply re-renders.

**Share.** A small client script fetches the PNG as a Blob, builds a `File`, and if `navigator.canShare({files})` is true calls `navigator.share({files, title})`. Otherwise it triggers a download via an `<a download>`. The PNG fetch uses the session cookie (same origin).

## Risks / Trade-offs

- [Text measurement or emoji in meal names render oddly] → Bundle a font with wide Latin coverage including umlauts (Älplermagronen, rösti) and test with the seed data. Emoji are out of scope.
- [resvg or satori behave differently on arm64] → Run a render test in the arm64 image build (QEMU) in CI.
- [iOS share-sheet file support differs between versions] → The download fallback always works, and David checks this on the phone.
