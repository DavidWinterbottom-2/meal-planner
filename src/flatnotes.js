// Read-only client for the four planning-rules notes kept in Flatnotes.
// Failures never throw: each section comes back as markdown or null with a
// reason, so planning can continue without the rules.

export const RULE_SECTIONS = ["household", "meal_bank", "recipes", "pantry"];

export const DEFAULT_RULE_TITLES = {
  household: "Meals - Household",
  meal_bank: "Meals - Meal Bank",
  recipes: "Meals - Recipes",
  pantry: "Meals - Pantry",
};

export function createRulesClient({
  url,
  username,
  password,
  titles = DEFAULT_RULE_TITLES,
  timeoutMs = 3000,
  fetchImpl = fetch,
}) {
  async function call(path, init = {}) {
    return fetchImpl(`${url}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  async function getToken() {
    const res = await call("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error(`Flatnotes login failed (${res.status})`);
    return (await res.json()).access_token;
  }

  // { sections: { household: "md" | null, … }, missing: [...], error: string | null }
  async function loadRules() {
    const sections = Object.fromEntries(RULE_SECTIONS.map((s) => [s, null]));
    if (!url || !username || !password) {
      return {
        sections,
        missing: [...RULE_SECTIONS],
        error: "Flatnotes is not configured on the meals server",
      };
    }
    let token;
    try {
      token = await getToken();
    } catch (e) {
      return {
        sections,
        missing: [...RULE_SECTIONS],
        error: `Flatnotes unreachable: ${e.message}`,
      };
    }
    const missing = [];
    await Promise.all(
      RULE_SECTIONS.map(async (section) => {
        const title = titles[section];
        try {
          const res = await call(`/api/notes/${encodeURIComponent(title)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(String(res.status));
          sections[section] = (await res.json()).content ?? "";
        } catch {
          missing.push(section);
        }
      }),
    );
    missing.sort((a, b) => RULE_SECTIONS.indexOf(a) - RULE_SECTIONS.indexOf(b));
    return { sections, missing, error: null };
  }

  return { loadRules, titles };
}

// Rule note titles from env (MEALS_RULE_NOTE_HOUSEHOLD, …), falling back to the defaults.
export function ruleTitlesFromEnv(env) {
  return Object.fromEntries(
    RULE_SECTIONS.map((s) => [
      s,
      env[`MEALS_RULE_NOTE_${s.toUpperCase()}`] || DEFAULT_RULE_TITLES[s],
    ]),
  );
}
