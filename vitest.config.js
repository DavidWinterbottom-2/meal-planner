import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    // src/vendor/ is a verbatim copy with its own node:test suite (npm run test:vendor).
    exclude: [...configDefaults.exclude, "src/vendor/**"],
    coverage: {
      // §4: fail CI when coverage of the source drops below 80%.
      provider: "v8",
      include: ["src/**/*.js"],
      exclude: ["src/vendor/**"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
