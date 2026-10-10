// End-to-end checks against a running meal-planner (the built image in CI,
// or `npm start` locally). Both listeners are driven directly:
//   E2E_VIEWER_URL (default http://127.0.0.1:3001) — the viewer listener
//   E2E_MCP_URL    (default http://127.0.0.1:3000) — the MCP listener
// Screenshots of the week page at 390px, light and dark, go to
// test-results/screenshots/ (uploaded as a CI artifact).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/artifacts",
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_VIEWER_URL || "http://127.0.0.1:3001",
    ...devices["iPhone 13"],
    browserName: "chromium",
  },
});
