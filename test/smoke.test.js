import { test, expect } from "vitest";
import { hello } from "../src/index.js";

test("smoke", () => {
  // Placeholder so CI has a test to run (§4). Replace with real tests.
  expect(hello()).toBe("hello from meal-planner");
});
