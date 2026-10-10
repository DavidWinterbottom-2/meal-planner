import { describe, test, expect } from "vitest";
import { analyticsTag } from "../../src/web/analytics.js";
import { escapeHtml, markup, raw } from "../../src/web/html.js";
import { renderHistory, renderWeek } from "../../src/web/render.js";
import { buildWeekView } from "../../src/web/view.js";

describe("markup", () => {
  test("escapes interpolated values, but not nested fragments or raw()", () => {
    const inner = markup`<b>${"<i>"}</b>`;
    expect(String(markup`<p>${inner}${raw("<br>")}${"a&b"}</p>`)).toBe(
      "<p><b>&lt;i&gt;</b><br>a&amp;b</p>",
    );
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
    expect(String(markup`${null}${false}${undefined}${0}`)).toBe("0");
  });
});

describe("analyticsTag", () => {
  const scriptUrl = "https://umami.winterbottom.xyz/script.js";

  test("both settings: a deferred Umami script", () => {
    expect(analyticsTag({ scriptUrl, websiteId: "abc-123" })).toBe(
      `<script defer src="${scriptUrl}" data-website-id="abc-123"></script>`,
    );
  });

  test("half-configured or unset: nothing", () => {
    expect(analyticsTag({ scriptUrl })).toBe("");
    expect(analyticsTag({ websiteId: "abc" })).toBe("");
    expect(analyticsTag()).toBe("");
  });

  test("attribute values are escaped", () => {
    expect(
      analyticsTag({ scriptUrl: 'https://x/"><script>', websiteId: "a" }),
    ).not.toMatch(/"><script>/);
  });
});

describe("renderWeek", () => {
  const week = {
    week_start: "2026-10-12",
    source: "Lisa",
    status: "data",
    prep: "Line 1\nLine 2",
    notes: null,
    days: [
      { date: "2026-10-12", lunch: "Kita", dinner: "<b>Fish</b> & chips" },
      ...[13, 14, 15, 16, 17, 18].map((d) => ({ date: `2026-10-${d}` })),
    ],
  };

  test("shows the plan with user text escaped", () => {
    const out = renderWeek(buildWeekView(week, "2026-10-12", "2026-10-15"));
    expect(out).toMatch(/&lt;b&gt;Fish&lt;\/b&gt; &amp; chips/);
    expect(out).not.toMatch(/<b>Fish/);
    expect(out).toMatch(/Thomas at Kita/);
    expect(out).toMatch(/Lisa&#39;s plan/);
    expect(out).toMatch(/aria-current="date"/);
    expect(out).toMatch(/rel="prev" href="\/week\/2026-10-05"/);
    expect(out).toMatch(/rel="next" href="\/week\/2026-10-19"/);
    expect(out).toMatch(/Line 1\nLine 2/);
  });

  test("is read-only: no forms or inputs", () => {
    const out = renderWeek(buildWeekView(week, "2026-10-12", "2026-10-15"));
    expect(out).not.toMatch(/<form|<input|<textarea|<select/i);
  });

  test("an unplanned week offers to plan it in Claude", () => {
    const out = renderWeek(buildWeekView(null, "2026-11-02", "2026-10-15"));
    expect(out).toMatch(/Nothing planned for this week yet/);
    expect(out).toMatch(/Plan it in Claude/);
    expect(out).toMatch(/In 3 weeks/);
    expect(out).not.toMatch(/mp-days/);
  });

  test("includes analytics only when configured, and no other script hosts", () => {
    const view = buildWeekView(week, "2026-10-12", "2026-10-15");
    const analytics = {
      scriptUrl: "https://umami.winterbottom.xyz/script.js",
      websiteId: "w1",
    };
    const on = renderWeek(view, { analytics });
    expect(on).toMatch(
      /<script defer src="https:\/\/umami\.winterbottom\.xyz\/script\.js" data-website-id="w1">/,
    );
    const srcs = [...on.matchAll(/<script[^>]*src="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(srcs.filter((s) => /^https?:/.test(s))).toEqual([
      analytics.scriptUrl,
    ]);
    expect(renderWeek(view)).not.toMatch(/umami|data-website-id/);
  });
});

describe("renderHistory", () => {
  test("lists weeks linking to each, or says none", () => {
    const out = renderHistory([
      {
        weekStart: "2026-10-12",
        heading: "Mon 12 – Sun 18 Oct",
        source: "David's plan",
        status: "image_only",
        dinners: "(no dinners)",
      },
    ]);
    expect(out).toMatch(/href="\/week\/2026-10-12"/);
    expect(out).toMatch(/image only/);
    expect(renderHistory([])).toMatch(/No weeks planned yet/);
  });
});
