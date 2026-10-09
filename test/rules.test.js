import { describe, test, expect } from "vitest";
import { ruleTitlesFromEnv, DEFAULT_RULE_TITLES } from "../src/rules.js";

describe("ruleTitlesFromEnv", () => {
  test("uses env overrides and falls back to defaults", () => {
    expect(
      ruleTitlesFromEnv({ MEALS_RULE_NOTE_PANTRY: "Pantry list" }),
    ).toEqual({
      ...DEFAULT_RULE_TITLES,
      pantry: "Pantry list",
    });
  });

  test("an empty override falls back to the default", () => {
    expect(ruleTitlesFromEnv({ MEALS_RULE_NOTE_HOUSEHOLD: "" })).toEqual(
      DEFAULT_RULE_TITLES,
    );
  });
});
