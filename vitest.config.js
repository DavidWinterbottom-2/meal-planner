import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    // src/vendor/ is a verbatim copy with its own node:test suite (npm run test:vendor).
    // tests/e2e/ is the Playwright suite (npm run test:e2e), run against a live server.
    exclude: [...configDefaults.exclude, "src/vendor/**", "tests/e2e/**"],
    coverage: {
      // §4: fail CI when coverage of the source drops below 80%.
      provider: "v8",
      include: ["src/**/*.js"],
      exclude: ["src/vendor/**", "src/web/static/winterbottom-theme.js"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
