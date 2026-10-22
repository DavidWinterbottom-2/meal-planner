import { describe, test, expect } from "vitest";
import sharp from "sharp";
import { cropToPlate, findPlate } from "../../src/images/plate-crop.js";

// A plain surface with a round plate (and a smaller blob of food on it).
const plate = ({
  size = 768,
  cx = 384,
  cy = 384,
  r = 200,
  surface = "#8a6a4a",
  noise = false,
} = {}) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    ${noise ? "" : `<rect width="100%" height="100%" fill="${surface}"/>`}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#f4f1ea"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.5}" fill="#c0622a"/>
  </svg>`;
  if (!noise) return sharp(Buffer.from(svg)).png().toBuffer();
  // A cluttered table: big blocks of unrelated colour behind the plate.
  const cell = 48;
  const raw = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = (((x / cell) | 0) * 7919 + ((y / cell) | 0) * 104729) % 251;
      raw.set([v, (v * 3) % 256, (v * 7) % 256], (y * size + x) * 3);
    }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
};

// The share of a row/column across the cropped picture that is surface.
const surfaceShare = async (png) => {
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const row = info.height >> 1;
  let surface = 0;
  for (let x = 0; x < info.width; x++) {
    const i = (row * info.width + x) * 3;
    if (Math.abs(data[i] - 0x8a) < 20 && Math.abs(data[i + 2] - 0x4a) < 20)
      surface++;
  }
  return surface / info.width;
};

describe("cropToPlate", () => {
  test("passes a whole plate and crops tight around it, same size out", async () => {
    const before = await plate();
    expect(await surfaceShare(before)).toBeGreaterThan(0.4);
    const { ok, png } = await cropToPlate(before);
    expect(ok).toBe(true);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([768, 768, "png"]);
    // Only the thin margin either side of the plate is surface now.
    expect(await surfaceShare(png)).toBeLessThan(0.15);
  });

  test("follows a plate that sits off-centre", async () => {
    const { ok, png } = await cropToPlate(
      await plate({ cx: 260, cy: 300, r: 180 }),
    );
    expect(ok).toBe(true);
    expect(await surfaceShare(png)).toBeLessThan(0.15);
  });

  test("passes a plate that already fills the picture, unchanged", async () => {
    const before = await plate({ r: 360 });
    expect(await cropToPlate(before)).toEqual({ ok: true, png: before });
  });

  test("fails a plate cut off by the edge", async () => {
    const before = await plate({ cx: 120, r: 200 });
    expect(await cropToPlate(before)).toEqual({ ok: false, png: before });
  });

  // Light grey surface, white plate, and a soft grey shadow below it that
  // runs off the bottom edge: the shadow isn't plate.
  const shadowed = (rim) =>
    sharp(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768">
        <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#d0d0d0"/><stop offset="1" stop-color="#a6a6a6"/>
        </linearGradient></defs>
        <rect width="100%" height="100%" fill="#d0d0d0"/>
        <rect x="150" y="420" width="468" height="348" fill="url(#s)"/>
        <circle cx="384" cy="384" r="${rim}" fill="#${rim > 384 ? "404040" : "fafafa"}"/>
        <circle cx="384" cy="384" r="150" fill="#c0622a"/>
      </svg>`),
    )
      .png()
      .toBuffer();

  test("passes a plate whose soft shadow runs off the edge", async () => {
    expect((await cropToPlate(await shadowed(300))).ok).toBe(true);
  });

  test("fails a dark bowl that runs off the edge", async () => {
    expect((await cropToPlate(await shadowed(400))).ok).toBe(false);
  });

  test("fails a busy background rather than guess", async () => {
    const before = await plate({ noise: true });
    expect(await cropToPlate(before)).toEqual({ ok: false, png: before });
  });

  test("fails a picture with no plate in it", async () => {
    const empty = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#808080" },
    })
      .png()
      .toBuffer();
    expect((await cropToPlate(empty)).ok).toBe(false);
  });

  test("fails bytes it can't decode, returning them unchanged", async () => {
    const junk = Buffer.from("not a picture");
    expect(await cropToPlate(junk)).toEqual({ ok: false, png: junk });
  });
});

describe("findPlate", () => {
  const grid = (fill) => {
    const rgb = Buffer.alloc(128 * 128 * 3);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) rgb.set(fill(x, y), (y * 128 + x) * 3);
    return rgb;
  };
  const disc = (cx, cy, r) =>
    grid((x, y) =>
      Math.hypot(x - cx, y - cy) < r ? [255, 255, 255] : [40, 40, 40],
    );

  test("rejects a tiny blob as not a plate", () => {
    expect(findPlate(disc(64, 64, 10))).toBeNull();
  });

  test("keeps the square inside the picture for a plate near an edge", () => {
    const { square, whole } = findPlate(disc(31, 64, 30));
    expect(whole).toBe(true);
    expect(square.left).toBe(0);
    expect(square.top + square.side).toBeLessThanOrEqual(128);
  });

  test("marks a plate touching an edge as not whole", () => {
    expect(findPlate(disc(20, 64, 30)).whole).toBe(false);
  });
});
