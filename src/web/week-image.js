// The shareable PNG of a week (OpenSpec add-week-png-share): a picture for
// WhatsApp, laid out like Lisa's own plans (2026-10-13): a serif week title on
// a soft banner, a Day | Morning tea | Lunch | Afternoon tea | Dinner grid
// with the dinner column wider and tinted (and its dish picture when there is
// one), and the week's prep and notes as bullets underneath. Rendered without
// a browser: buildImageTree() is the pure layout (satori's element tree,
// testable without rendering); renderWeekPng() lays it out to SVG with satori
// and rasterises it with resvg.

import { readFileSync } from "node:fs";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

export const IMAGE_WIDTH = 1200;

// Lisa's palette: sage greens on warm cream, pastel dinner cells. Always
// light, since it's shared to other people's phones.
const C = {
  page: "#f4f2ea",
  card: "#fcfbf6",
  banner: "#dde6d3",
  head: "#e3eadb",
  dayCell: "#f1f3ea",
  cell: "#ffffff",
  line: "#e4e7dc",
  title: "#1f3a2b",
  ink: "#26332b",
  ink2: "#5d6a60",
  dash: "#9aa59c",
  notes: "#e6eddf",
};
const DINNER_TINTS = ["#e4ecdc", "#e4ecdc", "#fbf0d4", "#ddebe9"];
const LEFTOVER_TINT = "#f8e0e0";

// Line icons from Lucide (ISC licence, lucide.dev), as data URIs.
const icon = (paths) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${C.title}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
  )}`;
const ICONS = {
  apple: icon(
    '<path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/>',
  ),
  sandwich: icon(
    '<path d="m2.37 11.223 8.372-6.777a2 2 0 0 1 2.516 0l8.371 6.777"/><path d="M21 15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.25"/><path d="M3 15a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h9"/><path d="m6.67 15 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2"/><rect width="20" height="4" x="2" y="11" rx="1"/>',
  ),
  cup: icon(
    '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  ),
  cutlery: icon(
    '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  ),
};

const GAP = 6;
export const COLUMNS = [
  { key: "day", title: "Day", width: 170 },
  { key: "morning_snack", title: "Morning tea", width: 168, icon: "apple" },
  { key: "lunch", title: "Lunch", width: 196, icon: "sandwich" },
  { key: "afternoon_snack", title: "Afternoon tea", width: 168, icon: "cup" },
  { key: "dinner", title: "Dinner", width: 346, icon: "cutlery" },
];

const el = (type, style, children) => ({ type, props: { style, children } });
const img = (src, size, style = {}) => ({
  type: "img",
  props: { src, width: size, height: size, style },
});

const weekday = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  });

// A stable pastel per dish, pink for leftovers / use-it-up nights.
export function dinnerTint(dinner) {
  if (!dinner) return DINNER_TINTS[0];
  if (/use.?it.?up|leftover/i.test(dinner)) return LEFTOVER_TINT;
  let h = 0;
  for (const ch of dinner) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DINNER_TINTS[h % DINNER_TINTS.length];
}

// The week's prep and notes as bullet lines.
export function noteLines(view) {
  return [view.prep, view.notes]
    .filter(Boolean)
    .flatMap((text) => text.split("\n"))
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function headerCell(column) {
  const isDinner = column.key === "dinner";
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: column.width,
      flexShrink: 0,
      padding: "14px 8px",
      borderRadius: 12,
      backgroundColor: isDinner ? C.banner : C.head,
      color: C.title,
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      textAlign: "center",
    },
    [
      ...(column.icon
        ? [img(ICONS[column.icon], 30, { marginBottom: 6 })]
        : []),
      el("div", { display: "flex" }, column.title),
    ],
  );
}

function dayCell(column, day) {
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      width: column.width,
      flexShrink: 0,
      padding: "14px 16px",
      borderRadius: 12,
      backgroundColor: C.dayCell,
    },
    [
      el(
        "div",
        {
          display: "flex",
          fontSize: 19,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: C.title,
        },
        weekday(day.date),
      ),
      el(
        "div",
        { display: "flex", fontSize: 16, color: C.ink2, marginTop: 2 },
        day.label.split(" ").slice(1).join(" "),
      ),
      ...(day.note
        ? [
            el(
              "div",
              {
                display: "flex",
                fontSize: 15,
                color: C.ink2,
                marginTop: 6,
                fontStyle: "italic",
                lineHeight: 1.3,
              },
              day.note,
            ),
          ]
        : []),
    ],
  );
}

function plainCell(column, text) {
  return el(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: column.width,
      flexShrink: 0,
      padding: "14px 12px",
      borderRadius: 12,
      backgroundColor: C.cell,
      border: `1px solid ${C.line}`,
      fontSize: 20,
      lineHeight: 1.35,
      textAlign: "center",
      color: text ? C.ink : C.dash,
    },
    text || "–",
  );
}

function dinnerCell(column, day, picture) {
  return el(
    "div",
    {
      display: "flex",
      alignItems: "center",
      width: column.width,
      flexShrink: 0,
      padding: "12px 12px 12px 16px",
      borderRadius: 12,
      backgroundColor: dinnerTint(day.dinner),
    },
    [
      el(
        "div",
        {
          display: "flex",
          flexGrow: 1,
          flexShrink: 1,
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1.3,
          color: day.dinner ? C.title : C.dash,
        },
        day.dinner || "–",
      ),
      ...(picture
        ? [
            img(picture, 96, {
              flexShrink: 0,
              marginLeft: 10,
              borderRadius: 48,
              objectFit: "cover",
            }),
          ]
        : []),
    ],
  );
}

// The element tree for a planned week's view model (buildWeekView).
// `dishPicture(day)` returns a data URI for that day's dinner picture, or
// null.
export function buildImageTree(view, { dishPicture = () => null } = {}) {
  const row = (cells) =>
    el("div", { display: "flex", gap: GAP, marginTop: GAP }, cells);
  const rows = view.days.map((day) =>
    row(
      COLUMNS.map((c) =>
        c.key === "day"
          ? dayCell(c, day)
          : c.key === "dinner"
            ? dinnerCell(c, day, dishPicture(day))
            : plainCell(c, day[c.key]),
      ),
    ),
  );

  const banner = el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      marginBottom: 22,
    },
    [
      el(
        "div",
        {
          display: "flex",
          padding: "10px 48px",
          borderRadius: 40,
          backgroundColor: C.banner,
          fontFamily: "Lora",
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: 2,
          color: C.title,
          textTransform: "uppercase",
        },
        view.heading,
      ),
      el("div", { display: "flex", alignItems: "center", marginTop: 12 }, [
        el("div", {
          display: "flex",
          width: 90,
          height: 2,
          backgroundColor: C.title,
        }),
        el(
          "div",
          {
            display: "flex",
            margin: "0 14px",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 2,
            color: C.title,
            textTransform: "uppercase",
          },
          view.source ?? "",
        ),
        el("div", {
          display: "flex",
          width: 90,
          height: 2,
          backgroundColor: C.title,
        }),
      ]),
    ],
  );

  const notes = noteLines(view);
  const notesBox = notes.length
    ? [
        el(
          "div",
          {
            display: "flex",
            flexDirection: "column",
            marginTop: 20,
            padding: "18px 24px",
            borderRadius: 16,
            backgroundColor: C.notes,
          },
          [
            el(
              "div",
              {
                display: "flex",
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 1.5,
                color: C.title,
                marginBottom: 8,
              },
              "NOTES",
            ),
            ...notes.map((line) =>
              el(
                "div",
                {
                  display: "flex",
                  fontSize: 18,
                  lineHeight: 1.4,
                  color: C.ink,
                },
                [
                  el("div", { display: "flex", width: 20, flexShrink: 0 }, "•"),
                  el("div", { display: "flex", flexShrink: 1 }, line),
                ],
              ),
            ),
          ],
        ),
      ]
    : [];

  return el(
    "div",
    {
      display: "flex",
      width: IMAGE_WIDTH,
      padding: 36,
      backgroundColor: C.page,
      fontFamily: "Inter",
    },
    [
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          width: "100%",
          padding: 28,
          borderRadius: 24,
          backgroundColor: C.card,
        },
        [
          banner,
          el("div", { display: "flex", gap: GAP }, COLUMNS.map(headerCell)),
          ...rows,
          ...notesBox,
        ],
      ),
    ],
  );
}

let fonts;
function loadFonts() {
  const read = (name) =>
    readFileSync(new URL(`../../assets/fonts/${name}`, import.meta.url));
  fonts ??= [
    {
      name: "Inter",
      data: read("Inter-Regular.woff"),
      weight: 400,
      style: "normal",
    },
    {
      name: "Inter",
      data: read("Inter-Bold.woff"),
      weight: 700,
      style: "normal",
    },
    {
      name: "Lora",
      data: read("Lora-Bold.woff"),
      weight: 700,
      style: "normal",
    },
  ];
  return fonts;
}

// The PNG bytes for a planned week. No height is given, so the image grows
// to fit wrapped text.
export async function renderWeekPng(view, options) {
  const svg = await satori(buildImageTree(view, options), {
    width: IMAGE_WIDTH,
    fonts: loadFonts(),
  });
  return new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
}
