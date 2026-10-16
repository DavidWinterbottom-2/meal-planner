// Server-rendered HTML for the viewer pages. Each renderer takes a view model
// from view.js and returns a complete document string. (The tag is `markup`,
// not `html`, so Prettier leaves these templates exactly as written.)

import { markup, raw } from "./html.js";
import { asset } from "../version.js";
import { analyticsTag } from "./analytics.js";

const PLAN_IN_CLAUDE = "https://claude.ai/new";

// A header icon button, as in the other winterbottom apps' account cluster.
function navIcon(href, label, icon, current) {
  return markup`<a class="wb-iconbtn" href="${href}" aria-label="${label}" title="${label}"${raw(current ? ' aria-current="page"' : "")}><svg class="wb-icon" aria-hidden="true"><use href="${asset("/static/winterbottom-icons.svg")}#${icon}"/></svg></a>`;
}

function layout({
  title,
  analytics,
  active,
  body,
  swipe = false,
  share = false,
}) {
  return markup`<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<!-- Browser chrome colour: the design system's --bg values (meta tags cannot read CSS tokens). -->
<meta name="theme-color" content="#f3f5f8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0c0e12" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Meals">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="icon" href="/icons/icon-192.png" type="image/png">
<script src="${asset("/static/winterbottom-theme.js")}"></script>
<link rel="stylesheet" href="${asset("/static/winterbottom.css")}">
<link rel="stylesheet" href="${asset("/static/app.css")}">
<script type="module" src="${asset("/static/offline.js")}"></script>
${swipe ? markup`<script type="module" src="${asset("/static/swipe.js")}"></script>` : ""}
${share ? markup`<script type="module" src="${asset("/static/share.js")}"></script>` : ""}
${raw(analyticsTag(analytics))}
</head>
<body>
<header class="wb-appbar">
  <a class="wb-brand" href="/"${raw(active === "week" ? ' aria-current="page"' : "")}><span class="wb-brand__mark">~</span>Meal Planner</a>
  <div class="wb-acct">
    ${navIcon("/upload", "Upload Lisa's plan", "wb-upload", active === "upload")}
    <a class="wb-signout" href="/oauth2/sign_out">Sign out</a>
    <button class="wb-iconbtn" type="button" data-wb-theme-toggle aria-label="Toggle theme"><span data-wb-theme-icon>☀</span></button>
  </div>
</header>
<main class="mp-main">
${body}
</main>
</body>
</html>
`.toString();
}

function dayRow(day) {
  const details = [
    day.lunch &&
      markup`<span class="${day.kita ? "mp-kita" : ""}"><span class="wb-label">Lunch</span> ${day.lunch}</span>`,
    day.snacks &&
      markup`<span><span class="wb-label">Snacks</span> ${day.snacks}</span>`,
  ].filter(Boolean);
  // data-date and the always-present (hidden) Today pill let offline.js
  // re-mark the days when a saved copy is shown on a later day.
  return markup`<li class="mp-day${day.isToday ? " mp-day--today" : ""}${day.isPast ? " mp-day--past" : ""}" data-date="${day.date}"${raw(day.isToday ? ' aria-current="date"' : "")}>
  <div class="mp-day__date">${day.label} <span class="wb-pill wb-pill--accent mp-today-pill"${raw(day.isToday ? "" : " hidden")}>Today</span></div>
  ${
    day.empty
      ? markup`<div class="mp-day__dinner mp-day__dinner--none">—</div>`
      : markup`${day.image ? markup`<a class="mp-day__imglink" href="${day.imageHref}" aria-label="Picture of ${day.dinner}"><img class="mp-day__img" src="${day.image}" alt="${day.dinner}" width="72" height="72" loading="lazy"></a>` : ""}<div class="mp-day__dinner">${day.dinner || "—"}</div>
  ${details.length ? markup`<div class="mp-day__more">${details}</div>` : ""}
  ${day.ingredients.length ? markup`<details class="mp-day__ingredients"><summary>Ingredients</summary><ul>${day.ingredients.map((i) => markup`<li>${i}</li>`)}</ul></details>` : ""}
  ${day.note ? markup`<div class="mp-day__note">${day.note}</div>` : ""}`
  }
</li>`;
}

export function renderWeek(view, { analytics } = {}) {
  const body = markup`<section class="mp-week">
  <div class="mp-week__head">
    <h1>${view.heading}</h1>
    <p class="mp-week__meta">
      <span class="wb-pill ${view.isCurrent ? "wb-pill--accent" : "wb-pill--neutral"}">${view.badge}</span>
      ${view.source ? markup`<span class="wb-label">${view.source}</span>` : ""}
      ${view.planned && !view.imageOnly ? markup`<button class="wb-btn wb-btn--secondary wb-btn--sm mp-share" type="button" data-share-week="${view.weekStart}">Share</button>` : ""}
    </p>
  </div>
  <nav class="mp-weeknav" aria-label="Weeks">
    <a class="wb-btn wb-btn--secondary wb-btn--sm" rel="prev" href="/week/${view.prev}">‹ Prev</a>
    <a class="wb-btn wb-btn--ghost wb-btn--sm" href="/">This week</a>
    <a class="wb-btn wb-btn--secondary wb-btn--sm" rel="next" href="/week/${view.next}">Next ›</a>
  </nav>
  ${
    view.imageOnly
      ? markup`<figure class="mp-original mp-original--full">
    <a href="${view.original}"><img src="${view.original}" alt="Lisa's plan for ${view.heading}"></a>
    <figcaption class="wb-muted">Lisa's plan, not typed in yet. Tap to zoom.</figcaption>
  </figure>`
      : view.planned
        ? markup`<ol class="mp-days">${view.days.map(dayRow)}</ol>
  ${view.prep ? markup`<section class="mp-block"><h2 class="wb-eyebrow">Prep</h2><p class="mp-pre">${view.prep}</p></section>` : ""}
  ${view.notes ? markup`<section class="mp-block"><h2 class="wb-eyebrow">Notes</h2><p class="mp-pre">${view.notes}</p></section>` : ""}
  ${view.original ? markup`<details class="mp-block mp-original"><summary class="wb-eyebrow">Lisa's original</summary><a href="${view.original}"><img src="${view.original}" alt="Lisa's original plan" loading="lazy"></a></details>` : ""}`
        : markup`<div class="mp-empty">
    <p>Nothing planned for this week yet.</p>
    <a class="wb-btn wb-btn--primary" href="${PLAN_IN_CLAUDE}">Plan it in Claude</a>
    <a class="wb-btn wb-btn--secondary" href="/upload?week=${view.weekStart}">Upload Lisa's plan</a>
  </div>`
  }
</section>`;
  return layout({
    title: `Meals · ${view.heading}`,
    analytics,
    active: "week",
    body,
    swipe: true,
    share: view.planned && !view.imageOnly,
  });
}

export function renderHistory(entries, { analytics } = {}) {
  const body = markup`<section class="mp-history">
  <h1>All weeks</h1>
  ${
    entries.length
      ? markup`<ol class="mp-history__list">${entries.map(
          (e) => markup`<li><a href="/week/${e.weekStart}">
    <span class="mp-history__when">${e.heading}</span>
    <span class="wb-label">${e.source}${e.status === "image_only" ? " · image only" : ""}</span>
    <span class="mp-history__dinners">${e.dinners}</span>
  </a></li>`,
        )}</ol>`
      : markup`<p class="mp-empty">No weeks planned yet.</p>`
  }
</section>`;
  return layout({
    title: "Meals · All weeks",
    analytics,
    active: "history",
    body,
  });
}

// The upload form. `weeks` are the Mondays offered, `selected` the one
// preselected; `error` is shown above the form after a rejected upload.
export function renderUpload({ weeks, selected, error, analytics } = {}) {
  const body = markup`<section class="mp-upload">
  <h1>Upload Lisa's plan</h1>
  <p class="wb-muted">Pick the week and her photo. Location and other details are removed before it's saved. Share the same photo with Claude to type it in.</p>
  ${error ? markup`<p class="wb-error" role="alert">${error}</p>` : ""}
  <form class="wb-card mp-upload__form" method="post" action="/upload" enctype="multipart/form-data">
    <div class="wb-field">
      <label for="week">Week</label>
      <select class="wb-select" id="week" name="week">${weeks.map(
        (w) =>
          markup`<option value="${w.weekStart}"${raw(w.weekStart === selected ? " selected" : "")}>${w.heading}${w.planned ? " · planned" : ""}</option>`,
      )}</select>
    </div>
    <div class="wb-field">
      <label for="image">Photo</label>
      <input class="wb-input" id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/*" required>
    </div>
    <button class="wb-btn wb-btn--primary" type="submit">Save</button>
  </form>
</section>`;
  return layout({ title: "Meals · Upload", analytics, active: "upload", body });
}

// A dinner's picture large, with a button to ask for a new one
// (add-dish-picture-redo). `queued` once a new picture is on its way.
export function renderDish({
  dish,
  src,
  back,
  action,
  queued,
  canRedo = true,
  analytics,
} = {}) {
  const body = markup`<section class="mp-dish">
  <a class="mp-dish__back" href="${back}">← Back to the week</a>
  <h1>${dish}</h1>
  <img class="mp-dish__img" src="${src}" alt="${dish}">
  ${
    !canRedo
      ? ""
      : queued
        ? markup`<p class="wb-pill wb-pill--accent mp-dish__queued" role="status">A new picture is on its way. It replaces this one once the desktop has made it.</p>`
        : markup`<form method="post" action="${action}">
    <button class="wb-btn wb-btn--primary" type="submit">New picture</button>
  </form>
  <p class="wb-muted">Don't like it? A new picture replaces this one in a few minutes, while the desktop is on.</p>`
  }
</section>`;
  return layout({ title: `Meals · ${dish}`, analytics, body });
}

export function renderNotFound({ analytics } = {}) {
  const body = markup`<section class="mp-empty">
  <h1>Not found</h1>
  <p>That page doesn't exist. <a href="/">Go to this week</a>.</p>
</section>`;
  return layout({ title: "Meals · Not found", analytics, body });
}

// Shown by the service worker for a page that isn't saved on this phone.
export function renderOffline({ analytics } = {}) {
  const body = markup`<section class="mp-empty">
  <h1>You're offline</h1>
  <p>This page isn't saved on this phone yet. Weeks you've opened before still work. <a href="/">Go to this week</a>.</p>
</section>`;
  return layout({ title: "Meals · Offline", analytics, body });
}
