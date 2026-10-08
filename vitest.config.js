import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      // §4: fail CI when coverage of the source drops below 80%.
      provider: "v8",
      include: ["src/**/*.js"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
