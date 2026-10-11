import { describe, test, expect } from "vitest";
import {
  DEFAULT_SKIP,
  dishKey,
  dishSeed,
  isSkippedDish,
  normaliseDish,
} from "../../src/images/dish.js";

describe("normaliseDish / dishKey", () => {
  test("trivial wording differences share a key", () => {
    expect(normaliseDish("Sausages, Roast Vegetables & Corn")).toBe(
      "sausages roast vegetables and corn",
    );
    expect(dishKey("Sausages, roast vegetables & corn")).toBe(
      dishKey("sausages  roast vegetables and corn!"),
    );
    expect(normaliseDish("Älplermagronen + apple sauce")).toBe(
      "älplermagronen apple sauce",
    );
  });

  test("different dishes get different 16-hex keys", () => {
    const a = dishKey("Rack of lamb + potatoes");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(dishKey("Sausages + mash"));
  });
});

describe("isSkippedDish", () => {
  test.each([
    ["Dinner at IKEA (out shopping)", true],
    ["Use-it-up night: leftovers + fish fingers", true],
    ["Kita", true],
    ["Takeaway pizza", true],
    ["", true],
    ["—", true],
    ["Rack of lamb + potatoes + broccoli", false],
    ["Homemade pizzas", false],
  ])("%s → %s", (text, skipped) => {
    expect(isSkippedDish(text, DEFAULT_SKIP)).toBe(skipped);
  });

  test("a custom list replaces the default", () => {
    expect(isSkippedDish("Homemade pizzas", ["pizza"])).toBe(true);
    expect(isSkippedDish("Kita", ["pizza"])).toBe(false);
  });
});

test("dishSeed is reproducible and changes with attempts", () => {
  const key = dishKey("Fish pie");
  expect(dishSeed(key)).toBe(dishSeed(key));
  expect(dishSeed(key, 1)).not.toBe(dishSeed(key));
  expect(dishSeed("ffffffffffffffff", 1)).toBe(0); // wraps at 2^32
});
