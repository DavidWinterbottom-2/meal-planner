import { test, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// src/vendor/ must stay a verbatim copy of mcp-development/shared/ (see its
// README). SHA256SUMS records the copied bytes; this fails if anyone edits
// the copy here instead of upstream. Re-copying from upstream means
// regenerating SHA256SUMS (`cd src/vendor && sha256sum oauth2-* > SHA256SUMS`).
test("vendored OAuth files match their recorded checksums", () => {
  const dir = new URL("../src/vendor/", import.meta.url);
  const sums = readFileSync(new URL("SHA256SUMS", dir), "utf8")
    .trim()
    .split("\n");
  expect(sums).toHaveLength(2);
  for (const line of sums) {
    const [hash, name] = line.split(/\s+/);
    const actual = createHash("sha256")
      .update(readFileSync(new URL(name, dir)))
      .digest("hex");
    expect(actual, name).toBe(hash);
  }
});
