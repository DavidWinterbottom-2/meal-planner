import { describe, test, expect, vi } from "vitest";
import {
  createRulesClient,
  ruleTitlesFromEnv,
  DEFAULT_RULE_TITLES,
} from "../src/flatnotes.js";

const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

// A stub Flatnotes: token endpoint plus a map of note title → content.
function stubFlatnotes(notes, { tokenStatus = 200 } = {}) {
  return vi.fn(async (url, init) => {
    if (url.endsWith("/api/token")) {
      expect(JSON.parse(init.body)).toEqual({ username: "u", password: "p" });
      return json({ access_token: "tok" }, tokenStatus);
    }
    expect(init.headers.Authorization).toBe("Bearer tok");
    const title = decodeURIComponent(url.split("/api/notes/")[1]);
    return title in notes
      ? json({ title, content: notes[title] })
      : json({ detail: "not found" }, 404);
  });
}

const config = { url: "http://flatnotes:8080", username: "u", password: "p" };

describe("loadRules", () => {
  test("returns all four sections", async () => {
    const notes = Object.fromEntries(
      Object.values(DEFAULT_RULE_TITLES).map((t) => [t, `# ${t}`]),
    );
    const client = createRulesClient({
      ...config,
      fetchImpl: stubFlatnotes(notes),
    });
    const rules = await client.loadRules();
    expect(rules.error).toBeNull();
    expect(rules.missing).toEqual([]);
    expect(rules.sections.household).toBe("# Meals - Household");
    expect(rules.sections.pantry).toBe("# Meals - Pantry");
  });

  test("reports a missing note and still returns the others", async () => {
    const notes = {
      "Meals - Household": "h",
      "Meals - Meal Bank": "m",
      "Meals - Pantry": "p",
    };
    const rules = await createRulesClient({
      ...config,
      fetchImpl: stubFlatnotes(notes),
    }).loadRules();
    expect(rules.missing).toEqual(["recipes"]);
    expect(rules.sections.recipes).toBeNull();
    expect(rules.sections.meal_bank).toBe("m");
  });

  test("reports Flatnotes unreachable without throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const rules = await createRulesClient({ ...config, fetchImpl }).loadRules();
    expect(rules.error).toMatch(/Flatnotes unreachable: fetch failed/);
    expect(rules.missing).toHaveLength(4);
  });

  test("reports a failed login", async () => {
    const rules = await createRulesClient({
      ...config,
      fetchImpl: stubFlatnotes({}, { tokenStatus: 401 }),
    }).loadRules();
    expect(rules.error).toMatch(/login failed \(401\)/);
  });

  test("reports missing configuration without calling Flatnotes", async () => {
    const fetchImpl = vi.fn();
    const rules = await createRulesClient({
      url: "",
      username: "",
      password: "",
      fetchImpl,
    }).loadRules();
    expect(rules.error).toMatch(/not configured/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("times out a hung request", async () => {
    const fetchImpl = (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener("abort", () => reject(init.signal.reason)),
      );
    const rules = await createRulesClient({
      ...config,
      timeoutMs: 20,
      fetchImpl,
    }).loadRules();
    expect(rules.error).toMatch(/Flatnotes unreachable/);
  });
});

describe("ruleTitlesFromEnv", () => {
  test("uses env overrides and falls back to defaults", () => {
    expect(
      ruleTitlesFromEnv({ MEALS_RULE_NOTE_PANTRY: "Pantry list" }),
    ).toEqual({
      ...DEFAULT_RULE_TITLES,
      pantry: "Pantry list",
    });
  });
});
