// Lisa's original plan images (OpenSpec add-lisa-image-upload): type checks,
// sanitising and storage on disk. An uploaded photo never keeps its
// location or other metadata: it is decoded and re-encoded as a fresh JPEG.

import sharp from "sharp";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_EDGE = 2000;
// Far above any phone photo; refuses pixel floods before decoding.
export const MAX_INPUT_PIXELS = 50_000_000;

export class UploadError extends Error {}

// The image type from the file's first bytes (the browser's MIME type and
// the file name are not trusted), or null.
export function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  )
    return "webp";
  if (buf.toString("latin1", 4, 8) === "ftyp") {
    const brand = buf.toString("latin1", 8, 12);
    if (
      ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(
        brand,
      )
    )
      return "heic";
  }
  return null;
}

// Rotate upright, cap the long edge, drop every bit of metadata (sharp
// writes none unless asked) and re-encode as JPEG.
export async function sanitiseImage(buf) {
  const type = detectImageType(buf);
  if (!type)
    throw new UploadError(
      "Unsupported file type: choose a JPEG, PNG or WebP photo.",
    );
  if (type === "heic")
    throw new UploadError(
      "That photo is HEIC, which can't be read here. Save it as JPEG (on iPhone: Settings → Camera → Formats → Most Compatible) or send it via WhatsApp first.",
    );
  try {
    return await sharp(buf, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new UploadError("That image couldn't be read. Try another photo.");
  }
}

const ID = /^[0-9a-f]{32}$/;
export const isPlanImageId = (id) => ID.test(id);
export const planImagePath = (dir, id) => join(dir, `${id}.jpg`);

// Write a sanitised JPEG under a new id, atomically (temporary file, then
// rename). Returns { id, filename }.
export function writePlanImage(dir, jpeg) {
  mkdirSync(dir, { recursive: true });
  const id = randomUUID().replaceAll("-", "");
  const filename = `${id}.jpg`;
  const tmp = join(dir, `.${filename}.tmp`);
  writeFileSync(tmp, jpeg);
  renameSync(tmp, join(dir, filename));
  return { id, filename };
}

export function removePlanImage(dir, id) {
  try {
    unlinkSync(planImagePath(dir, id));
  } catch {
    // Already gone.
  }
}

// Delete image files no database row knows about (a crash between writing
// the file and its row), once they are older than `maxAgeMs`. Returns the
// number removed.
export function sweepOrphanImages(
  dir,
  knownIds,
  now = Date.now(),
  maxAgeMs = 30 * 86400000,
) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const m = /^\.?([0-9a-f]{32})\.jpg(\.tmp)?$/.exec(name);
    if (!m || (knownIds.has(m[1]) && !m[2])) continue;
    const file = join(dir, name);
    if (now - statSync(file).mtimeMs < maxAgeMs) continue;
    unlinkSync(file);
    removed++;
  }
  return removed;
}
