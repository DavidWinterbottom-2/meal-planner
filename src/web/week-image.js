// The shareable PNG of a week (OpenSpec add-week-png-share): a table image for
// WhatsApp, rendered without a browser. buildImageTree() is the pure layout
// (satori's element tree, testable without rendering); renderWeekPng() lays it
// out to SVG with satori and rasterises it with resvg.

import { readFileSync } from "node:fs";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

export const IMAGE_WIDTH = 1200;

// The design system's light tokens (winterbottom.css). The image is always
// light: it is shared to other people's phones.
const C = {
  bg: "#f3f5f8",
  surface: "#ffffff",
  surface2: "#e9edf2",
  border: "#d9dee6",
  ink: "#14171c",
  ink2: "#545b66",
  ink3: "#878e9a",
  accent: "#a5620f",
};

export const COLUMNS = [
  { key: "label", title: "Day", width: 170 },
  { key: "lunch", title: "Lunch", width: 220 },
  { key: "snacks", title: "Snacks", width: 230 },
  { key: "dinner", title: "Dinner", width: 290 },
  { key: "note", title: "Notes", width: 210 },
];

const el = (type, style, children) => ({
  type,
  props: { style, children },
});

function cell(column, text, { header = false } = {}) {
  return el(
    "div",
    {
      display: "flex",
      width: column.width,
      flexShrink: 0,
      padding: "14px 16px",
      fontSize: header ? 22 : 24,
      lineHeight: 1.35,
      fontWeight: header || column.key === "label" ? 700 : 400,
      color: header ? C.ink2 : text ? C.ink : C.ink3,
    },
    text || (header ? "" : "—"),
  );
}

function row(children, { shade = false, last = false } = {}) {
  return el(
    "div",
    {
      display: "flex",
      backgroundColor: shade ? C.surface2 : C.surface,
      borderBottom: last ? "none" : `1px solid ${C.border}`,
    },
    children,
  );
}

// The element tree for a planned week's view model (buildWeekView).
export function buildImageTree(view) {
  const header = row(
    COLUMNS.map((c) => cell(c, c.title, { header: true })),
    { shade: true },
  );
  const rows = view.days.map((day, i) =>
    row(
      COLUMNS.map((c) => cell(c, day[c.key])),
      { last: i === view.days.length - 1 },
    ),
  );
  const children = [
    el(
      "div",
      { display: "flex", fontSize: 44, fontWeight: 700, color: C.ink },
      view.heading,
    ),
    el(
      "div",
      {
        display: "flex",
        marginTop: 6,
        fontSize: 24,
        color: C.accent,
        fontWeight: 700,
      },
      view.source ?? "",
    ),
    el(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        marginTop: 28,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: "hidden",
      },
      [header, ...rows],
    ),
  ];
  if (view.prep) {
    children.push(
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          marginTop: 28,
          padding: "18px 20px",
          backgroundColor: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
        },
        [
          el(
            "div",
            { display: "flex", fontSize: 20, fontWeight: 700, color: C.ink2 },
            "PREP",
          ),
          el(
            "div",
            {
              display: "flex",
              marginTop: 8,
              fontSize: 24,
              lineHeight: 1.4,
              color: C.ink,
              whiteSpace: "pre-wrap",
            },
            view.prep,
          ),
        ],
      ),
    );
  }
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: IMAGE_WIDTH,
      padding: 40,
      backgroundColor: C.bg,
      fontFamily: "Inter",
    },
    children,
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
  ];
  return fonts;
}

// The PNG bytes for a planned week. No height is given, so the image grows
// to fit wrapped text.
export async function renderWeekPng(view) {
  const svg = await satori(buildImageTree(view), {
    width: IMAGE_WIDTH,
    fonts: loadFonts(),
  });
  return new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
}
