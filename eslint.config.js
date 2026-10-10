import js from "@eslint/js";
import globals from "globals";

// §10: lint every file. `npm run lint` runs this plus `prettier --check .`.
export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // `const { dropped, ...rest } = obj` is the idiom for omitting a field.
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    // Browser code: served as-is (swipe.js), or run in the page by
    // Playwright's page.evaluate() callbacks in the e2e specs.
    files: ["src/web/static/**/*.js", "tests/e2e/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Vendored verbatim from docker-infra/design-system; never edited here.
    ignores: ["src/web/static/winterbottom-theme.js"],
  },
];
