import { describe, test, expect } from "vitest";
import { classifySwipe } from "../../src/web/static/swipe.js";

describe("classifySwipe", () => {
  test.each([
    [-120, 10, "next"], // swipe left: next week
    [120, -10, "prev"], // swipe right: previous week
    [-61, 0, "next"],
    [-60, 0, null], // must be more than 60px
    [-100, 60, null], // vertical scroll with sideways drift
    [-100, 49, "next"],
    [10, 300, null], // plain scroll
  ])("dx=%i dy=%i → %s", (dx, dy, expected) => {
    expect(classifySwipe(dx, dy)).toBe(expected);
  });
});
