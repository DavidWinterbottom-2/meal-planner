import { describe, test, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server.js";

const KEY = "k".repeat(64);

describe("startServer", () => {
  test("starts, seeds, serves /health, and stops every listener and the store", async () => {
    const dir = mkdtempSync(join(tmpdir(), "meals-"));
    const logs = [];
    try {
      const running = await startServer({
        env: {
          MCP_API_KEY: KEY,
          PORT: "0",
          VIEWER_PORT: "0",
          MEALS_DB: join(dir, "meals.db"),
        },
        host: "127.0.0.1",
        log: (m) => logs.push(m),
      });
      const { port } = running.servers[0].address();
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const viewer = running.servers[1].address().port;
      expect(viewer).not.toBe(port);
      const page = await fetch(`http://127.0.0.1:${viewer}/history`);
      expect(page.status).toBe(200);
      expect(await page.text()).toMatch(/All weeks/);
      expect(logs[1]).toMatch(/viewer on :\d+/);
      expect(logs[0]).toMatch(/Seeded 2 example weeks/);
      await running.stop();
      expect(running.servers.every((s) => !s.listening)).toBe(true);
      expect(running.store._db.open).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("refuses to start on bad configuration", async () => {
    await expect(startServer({ env: {} })).rejects.toThrow(/MCP_API_KEY/);
  });

  test("closes the store if the port can't be bound", async () => {
    const dir = mkdtempSync(join(tmpdir(), "meals-"));
    try {
      const first = await startServer({
        env: {
          MCP_API_KEY: KEY,
          PORT: "0",
          VIEWER_PORT: "0",
          MEALS_DB: join(dir, "a.db"),
        },
        host: "127.0.0.1",
        log: () => {},
      });
      const { port } = first.servers[0].address();
      await expect(
        startServer({
          env: {
            MCP_API_KEY: KEY,
            PORT: String(port),
            VIEWER_PORT: "0",
            MEALS_DB: join(dir, "b.db"),
          },
          host: "127.0.0.1",
          log: () => {},
        }),
      ).rejects.toThrow(/EADDRINUSE/);
      await first.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
