// Dish identity for pictures: one picture per distinct dinner text, after a
// light normalisation so trivial wording differences ("&" vs "and", commas,
// "+") share a picture. Pure functions; no I/O.

import { createHash } from "node:crypto";

// Dinners that aren't a cooked dish get no picture. Matched as
// case-insensitive substrings of the normalised text; override with
// DISH_IMAGE_SKIP (comma-separated).
export const DEFAULT_SKIP = [
  "dinner out",
  "eating out",
  "out shopping",
  "ikea",
  "restaurant",
  "takeaway",
  "take away",
  "leftover",
  "use it up",
  "kita",
];

export function normaliseDish(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// 16 hex chars of the normalised text's SHA-256: the picture's file name.
export function dishKey(text) {
  return createHash("sha256")
    .update(normaliseDish(text))
    .digest("hex")
    .slice(0, 16);
}

export function isSkippedDish(text, patterns = DEFAULT_SKIP) {
  const n = normaliseDish(text);
  if (!n) return true;
  return patterns.some((p) => {
    const pat = normaliseDish(p);
    return pat && n.includes(pat);
  });
}

// A reproducible seed per dish, so the same dish regenerates the same way
// unless asked for a new one (attempts nudge it).
export function dishSeed(key, attempt = 0) {
  return (Number.parseInt(key.slice(0, 8), 16) + attempt) % 2 ** 32;
}
