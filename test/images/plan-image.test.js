import { describe, test, expect } from "vitest";
import sharp from "sharp";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectImageType,
  isPlanImageId,
  planImagePath,
  removePlanImage,
  sanitiseImage,
  sweepOrphanImages,
  UploadError,
  writePlanImage,
} from "../../src/images/plan-image.js";

const photo = (width, height, format = "jpeg") => {
  const img = sharp({
    create: { width, height, channels: 3, background: "#c08040" },
  });
  return img[format]().toBuffer();
};

describe("detectImageType", () => {
  test("by magic bytes, not by name", async () => {
    expect(detectImageType(await photo(20, 20, "jpeg"))).toBe("jpeg");
    expect(detectImageType(await photo(20, 20, "png"))).toBe("png");
    expect(detectImageType(await photo(20, 20, "webp"))).toBe("webp");
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypheic"),
      Buffer.alloc(16),
    ]);
    expect(detectImageType(heic)).toBe("heic");
    expect(detectImageType(Buffer.from("%PDF-1.7 hello world"))).toBeNull();
    expect(detectImageType(Buffer.from("tiny"))).toBeNull();
    expect(detectImageType(undefined)).toBeNull();
  });
});

describe("sanitiseImage", () => {
  test("drops location and every other bit of metadata", async () => {
    const withGps = await sharp(await photo(40, 30))
      .withExif({
        IFD0: { Make: "Phone", Copyright: "Lisa" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "47/1 22/1 0/1" },
      })
      .jpeg()
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const clean = await sanitiseImage(withGps);
    const meta = await sharp(clean).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  test("caps the long edge at 2000px and never enlarges", async () => {
    const big = await sanitiseImage(await photo(3000, 1500, "png"));
    expect(await sharp(big).metadata()).toMatchObject({
      width: 2000,
      height: 1000,
      format: "jpeg",
    });
    const small = await sanitiseImage(await photo(300, 200, "webp"));
    expect(await sharp(small).metadata()).toMatchObject({
      width: 300,
      height: 200,
    });
  });

  test("rejects other files, HEIC with a way out, and broken images", async () => {
    await expect(sanitiseImage(Buffer.from("%PDF-1.7 hello"))).rejects.toThrow(
      /Unsupported file type/,
    );
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypmif1"),
      Buffer.alloc(16),
    ]);
    await expect(sanitiseImage(heic)).rejects.toThrow(/HEIC/);
    const broken = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(40),
    ]);
    await expect(sanitiseImage(broken)).rejects.toBeInstanceOf(UploadError);
  });
});

describe("storage", () => {
  test("writes under a fresh 32-hex id, removes, and sweeps old orphans only", () => {
    const dir = mkdtempSync(join(tmpdir(), "plan-images-"));
    try {
      const a = writePlanImage(join(dir, "sub"), Buffer.from("a"));
      expect(isPlanImageId(a.id)).toBe(true);
      expect(isPlanImageId("../etc/passwd")).toBe(false);
      expect(existsSync(planImagePath(join(dir, "sub"), a.id))).toBe(true);
      removePlanImage(join(dir, "sub"), a.id);
      removePlanImage(join(dir, "sub"), a.id); // already gone: fine
      expect(readdirSync(join(dir, "sub"))).toEqual([]);

      const known = "a".repeat(32);
      const orphan = "b".repeat(32);
      const young = "c".repeat(32);
      for (const name of [
        `${known}.jpg`,
        `${orphan}.jpg`,
        `.${known}.jpg.tmp`,
        `${young}.jpg`,
        "notes.txt",
      ])
        writeFileSync(join(dir, name), "x");
      const old = new Date(Date.now() - 40 * 86400000);
      for (const name of [`${known}.jpg`, `${orphan}.jpg`, `.${known}.jpg.tmp`])
        utimesSync(join(dir, name), old, old);

      expect(sweepOrphanImages(dir, new Set([known]))).toBe(2);
      expect(readdirSync(dir).sort()).toEqual(
        [`${known}.jpg`, `${young}.jpg`, "notes.txt", "sub"].sort(),
      );
      expect(sweepOrphanImages(join(dir, "missing"), new Set())).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("pixel floods", () => {
  test("an image over 50 megapixels is refused before decoding", async () => {
    const flood = await sharp({
      create: { width: 8000, height: 8000, channels: 3, background: "#fff" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(sanitiseImage(flood)).rejects.toBeInstanceOf(UploadError);
  });
});
