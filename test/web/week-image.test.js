import { describe, test, expect } from "vitest";
import {
  buildImageTree,
  COLUMNS,
  IMAGE_WIDTH,
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

describe("buildImageTree", () => {
  const tree = buildImageTree(seededView());
  const [heading, source, table] = tree.props.children;
  const [header, ...rows] = table.props.children;

  test("at least 1080px wide, light background", () => {
    expect(IMAGE_WIDTH).toBeGreaterThanOrEqual(1080);
    expect(tree.props.style.width).toBe(IMAGE_WIDTH);
    expect(tree.props.style.backgroundColor).toBe("#f3f5f8");
  });

  test("heading and source above a Day | Lunch | Snacks | Dinner | Notes table", () => {
    expect(texts(heading)).toEqual(["Mon 12 – Sun 18 Oct"]);
    expect(texts(source)).toEqual(["David's plan"]);
    expect(texts(header)).toEqual([
      "Day",
      "Lunch",
      "Snacks",
      "Dinner",
      "Notes",
    ]);
    expect(COLUMNS.reduce((sum, c) => sum + c.width, 0)).toBeLessThanOrEqual(
      IMAGE_WIDTH - 80,
    );
  });

  test("seven day rows, Kita reads as where Thomas is", () => {
    expect(rows).toHaveLength(7);
    expect(texts(rows[0])[0]).toBe("Mon 12 Oct");
    expect(texts(rows[6])[0]).toBe("Sun 18 Oct");
    expect(texts(rows[0])[1]).toBe("Thomas at Kita");
  });

  test("snacks combine the morning and afternoon snack; empty cells show —", () => {
    const view = seededView();
    view.days[3] = {
      ...view.days[3],
      snacks: "Fruit · Crackers + cheese",
      note: null,
    };
    const row = buildImageTree(view).props.children[2].props.children[4];
    expect(texts(row)[2]).toBe("Fruit · Crackers + cheese");
    expect(texts(row)[4]).toBe("—");
  });

  test("the prep block only when the week has prep", () => {
    expect(texts(tree)).not.toContain("PREP");
    const withPrep = buildImageTree({
      ...seededView(),
      prep: "Thaw meatballs",
    });
    expect(texts(withPrep)).toEqual(
      expect.arrayContaining(["PREP", "Thaw meatballs"]),
    );
  });
});

describe("renderWeekPng", () => {
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
