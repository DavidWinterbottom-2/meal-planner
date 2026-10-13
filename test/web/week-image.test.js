import { describe, test, expect } from "vitest";
import {
  buildImageTree,
  COLUMNS,
  dinnerTint,
  IMAGE_WIDTH,
  noteLines,
  renderWeekPng,
} from "../../src/web/week-image.js";
import { buildWeekView } from "../../src/web/view.js";
import { openStore } from "../../src/store.js";
import { seedIfEmpty } from "../../src/seed/weeks.js";

const store = openStore();
seedIfEmpty(store, "2026-10-01T00:00:00.000Z");
const seededView = () =>
  buildWeekView(store.getWeek("2026-10-12"), "2026-10-12", "2026-10-15");

// All the text in a satori element tree, in document order.
function texts(node) {
  if (node == null || node === false) return [];
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  return texts(node.props.children);
}

const pngSize = (png) => ({
  width: png.readUInt32BE(16),
  height: png.readUInt32BE(20),
});

// Every image src in a tree.
function images(node) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(images);
  return [
    ...(node.type === "img" ? [node.props.src] : []),
    ...images(node.props.children),
  ];
}

describe("buildImageTree (Lisa's layout)", () => {
  const tree = buildImageTree(seededView());
  const card = tree.props.children[0];
  const [banner, header, ...rest] = card.props.children;
  const rows = rest.slice(0, 7);

  test("at least 1080px wide, on Lisa's warm cream", () => {
    expect(IMAGE_WIDTH).toBeGreaterThanOrEqual(1080);
    expect(tree.props.style.width).toBe(IMAGE_WIDTH);
    expect(tree.props.style.backgroundColor).toBe("#f4f2ea");
  });

  test("serif week title and whose plan, over Day | Morning tea | Lunch | Afternoon tea | Dinner | Notes", () => {
    expect(texts(banner)).toEqual(["Mon 12 – Sun 18 Oct", "David's plan"]);
    expect(banner.props.children[0].props.style.fontFamily).toBe("Lora");
    expect(texts(header)).toEqual([
      "Day",
      "Morning tea",
      "Lunch",
      "Afternoon tea",
      "Dinner",
      "Notes",
    ]);
    // Each meal column header carries its icon.
    expect(images(header)).toHaveLength(5);
    const gaps = 6 * (COLUMNS.length - 1);
    expect(COLUMNS.reduce((sum, c) => sum + c.width, 0) + gaps).toBe(
      IMAGE_WIDTH - 2 * 36 - 2 * 28,
    );
  });

  test("seven day rows: full day name, date, the two snacks apart, Kita, the day's note", () => {
    expect(rows).toHaveLength(7);
    expect(texts(rows[0]).slice(0, 2)).toEqual(["Monday", "12 Oct"]);
    expect(texts(rows[6])[0]).toBe("Sunday");
    expect(texts(rows[0])[3]).toBe("Thomas at Kita");
    const view = seededView();
    view.days[3] = {
      ...view.days[3],
      morning_snack: "Fruit",
      afternoon_snack: "Crackers + cheese",
      note: "Cleaner 1:30–5pm",
    };
    const thu = buildImageTree(view).props.children[0].props.children[5];
    expect(texts(thu)).toEqual([
      "Thursday",
      "15 Oct",
      "Fruit",
      view.days[3].lunch,
      "Crackers + cheese",
      view.days[3].dinner,
      "Cleaner 1:30–5pm",
    ]);
  });

  test("empty cells show –", () => {
    // Monday has no snacks in the seed.
    expect(texts(rows[0])[2]).toBe("–");
    expect(texts(rows[0])[4]).toBe("–");
  });

  test("food pictures appear in every meal cell that has one", () => {
    const pic = "data:image/jpeg;base64,AAAA";
    const withPics = buildImageTree(seededView(), {
      dishPicture: (text) =>
        text === "Fruit" || text === "Homemade pizza" ? pic : null,
    });
    const all = images(withPics).filter((src) => src === pic);
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(
      images(tree).filter((src) => src.startsWith("data:image/jpeg")),
    ).toEqual([]);
  });

  test("dinner tints: stable per dish, pink for leftovers", () => {
    expect(dinnerTint("Homemade pizza")).toBe(dinnerTint("Homemade pizza"));
    expect(dinnerTint("Use-It-Up Night: leftovers")).toBe("#f8e0e0");
    expect(dinnerTint(null)).toBe("#e4ecdc");
  });

  test("the week notes box: prep and notes as bullets, only when there are some", () => {
    expect(texts(card)).not.toContain("WEEK NOTES");
    expect(
      noteLines({
        prep: "- Thaw meatballs\n\n• Batch sauce",
        notes: "Swim Sat",
      }),
    ).toEqual(["Thaw meatballs", "Batch sauce", "Swim Sat"]);
    const withPrep = buildImageTree({
      ...seededView(),
      prep: "Thaw meatballs",
    });
    expect(texts(withPrep)).toEqual(
      expect.arrayContaining(["WEEK NOTES", "•", "Thaw meatballs"]),
    );
  });
});

// CPU-heavy, and the first render loads fonts and WASM: allow more than
// vitest's 5 s on a busy CI runner.
describe("renderWeekPng", { timeout: 20_000 }, () => {
  test("a PNG at least 1080px wide; a long dinner wraps and makes it taller", async () => {
    const view = seededView();
    const base = await renderWeekPng(view);
    expect(base.subarray(1, 4).toString()).toBe("PNG");
    const { width, height } = pngSize(base);
    expect(width).toBeGreaterThanOrEqual(1080);

    const long = seededView();
    long.days[3] = {
      ...long.days[3],
      dinner:
        "Älplermagronen with rösti, apple sauce, crispy onions and a big green salad, too",
    };
    expect(long.days[3].dinner).toHaveLength(80);
    const taller = pngSize(await renderWeekPng(long));
    expect(taller.width).toBe(width);
    expect(taller.height).toBeGreaterThan(height);
  });
});
