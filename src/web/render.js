// Server-rendered HTML for the viewer pages. Each renderer takes a view model
// from view.js and returns a complete document string. (The tag is `markup`,
// not `html`, so Prettier leaves these templates exactly as written.)

import { markup, raw } from "./html.js";
import { analyticsTag } from "./analytics.js";

const PLAN_IN_CLAUDE = "https://claude.ai/new";

function layout({ title, analytics, active, body, swipe = false }) {
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
<script src="/static/winterbottom-theme.js"></script>
<link rel="stylesheet" href="/static/winterbottom.css">
<link rel="stylesheet" href="/static/app.css">
${swipe ? raw('<script type="module" src="/static/swipe.js"></script>') : ""}
${raw(analyticsTag(analytics))}
</head>
<body>
<header class="wb-appbar">
  <a class="wb-brand" href="/"><span class="wb-brand__mark">~</span>meals</a>
  <nav class="wb-nav">
    <a href="/"${raw(active === "week" ? ' aria-current="page"' : "")}>Week</a>
    <a href="/history"${raw(active === "history" ? ' aria-current="page"' : "")}>History</a>
  </nav>
  <div class="wb-acct">
    <button class="wb-iconbtn" type="button" data-wb-theme-toggle aria-label="Switch theme"><span data-wb-theme-icon>☀</span></button>
  </div>
</header>
<main class="mp-main">
${body}
</main>
<footer class="mp-footer"><a class="wb-signout" href="/oauth2/sign_out">Sign out</a></footer>
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
  return markup`<li class="mp-day${day.isToday ? " mp-day--today" : ""}"${raw(day.isToday ? ' aria-current="date"' : "")}>
  <div class="mp-day__date">${day.label}${day.isToday ? markup` <span class="wb-pill wb-pill--accent">Today</span>` : ""}</div>
  ${
    day.empty
      ? markup`<div class="mp-day__dinner mp-day__dinner--none">—</div>`
      : markup`<div class="mp-day__dinner">${day.dinner || "—"}</div>
  ${details.length ? markup`<div class="mp-day__more">${details}</div>` : ""}
  ${day.note ? markup`<div class="mp-day__note">${day.note}</div>` : ""}`
  }
</li>`;
}

export function renderWeek(view, { analytics } = {}) {
  const body = markup`<section class="mp-week">
  <div class="mp-week__head">
    <span class="wb-pill ${view.isCurrent ? "wb-pill--accent" : "wb-pill--neutral"}">${view.badge}</span>
    <h1>${view.heading}</h1>
    ${view.source ? markup`<p class="wb-label">${view.source}</p>` : ""}
  </div>
  <nav class="mp-weeknav" aria-label="Weeks">
    <a class="wb-btn wb-btn--secondary wb-btn--sm" rel="prev" href="/week/${view.prev}">‹ Prev</a>
    <a class="wb-btn wb-btn--ghost wb-btn--sm" href="/">This week</a>
    <a class="wb-btn wb-btn--secondary wb-btn--sm" rel="next" href="/week/${view.next}">Next ›</a>
  </nav>
  ${
    view.planned
      ? markup`<ol class="mp-days">${view.days.map(dayRow)}</ol>
  ${view.prep ? markup`<section class="mp-block"><h2 class="wb-eyebrow">Prep</h2><p class="mp-pre">${view.prep}</p></section>` : ""}
  ${view.notes ? markup`<section class="mp-block"><h2 class="wb-eyebrow">Notes</h2><p class="mp-pre">${view.notes}</p></section>` : ""}`
      : markup`<div class="mp-empty">
    <p>Nothing planned for this week yet.</p>
    <a class="wb-btn wb-btn--primary" href="${PLAN_IN_CLAUDE}">Plan it in Claude</a>
  </div>`
  }
</section>`;
  return layout({
    title: `Meals · ${view.heading}`,
    analytics,
    active: "week",
    body,
    swipe: true,
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

export function renderNotFound({ analytics } = {}) {
  const body = markup`<section class="mp-empty">
  <h1>Not found</h1>
  <p>That page doesn't exist. <a href="/">Go to this week</a>.</p>
</section>`;
  return layout({ title: "Meals · Not found", analytics, body });
}
