// Check and crop a generated dish picture so the week and dish pages show
// the whole plate and nothing else. The picture is asked for as an overhead
// shot of one plate on a plain surface; the plate is then whatever stands
// out from the surface colour at the picture's edge. A picture passes when
// such a plate is found clear of every edge (so none of it is cut off), and
// is then cropped to a tight square around it. Never throws.

import sharp from "sharp";

// Detection runs on a small blurred copy: fast, and texture in the surface
// (wood grain, linen) blurs into its average colour.
const GRID = 128;
// How far (RGB distance) a pixel must be from the surface colour to count
// as plate.
const DIFF = 48;
// A border this noisy isn't a plain surface: don't guess.
const MAX_BORDER_SPREAD = 40;
// A row or column belongs to the plate when this share of it differs.
const LINE_SHARE = 0.04;
// Breathing room around the plate, as a share of its size.
const MARGIN = 0.04;
// Skip crops that would remove almost nothing, or keep almost nothing.
const MAX_KEEP = 0.94;
const MIN_KEEP = 0.3;

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
};

// The plate in GRID units: { square, whole }, where `square` is the crop
// (null when the plate already fills the picture) and `whole` says it stays
// clear of every edge. null when there's no confident plate at all.
export function findPlate(rgb, size = GRID) {
  const px = (x, y) => {
    const i = (y * size + x) * 3;
    return [rgb[i], rgb[i + 1], rgb[i + 2]];
  };
  const border = [];
  for (let i = 0; i < size; i++)
    border.push(px(i, 0), px(i, size - 1), px(0, i), px(size - 1, i));
  const bg = [0, 1, 2].map((c) => median(border.map((p) => p[c])));
  const dist = (p) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]);
  // Most of the border must be surface; a plate touching one edge is fine.
  if (median(border.map(dist)) > MAX_BORDER_SPREAD / 2) return null;

  const rows = new Array(size).fill(0);
  const cols = new Array(size).fill(0);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (dist(px(x, y)) > DIFF) {
        rows[y]++;
        cols[x]++;
      }
  const min = Math.max(1, Math.round(size * LINE_SHARE));
  const first = (a) => a.findIndex((n) => n >= min);
  const last = (a) =>
    a.length - 1 - [...a].reverse().findIndex((n) => n >= min);
  const top = first(rows);
  const left = first(cols);
  if (top < 0 || left < 0) return null;
  const bottom = last(rows);
  const right = last(cols);

  const w = right - left + 1;
  const h = bottom - top + 1;
  if (Math.max(w, h) < size * MIN_KEEP) return null;
  const whole = top > 0 && left > 0 && bottom < size - 1 && right < size - 1;
  const side = Math.ceil(Math.max(w, h) * (1 + 2 * MARGIN));
  if (side > size * MAX_KEEP) return { square: null, whole };
  const clamp = (v) => Math.min(Math.max(v, 0), size - side);
  return {
    square: {
      left: clamp(Math.round(left + w / 2 - side / 2)),
      top: clamp(Math.round(top + h / 2 - side / 2)),
      side,
    },
    whole,
  };
}

// { ok, png }: ok when the whole plate is in the picture, and then png is
// cropped to it (a PNG at the original size). Otherwise png is the input.
export async function cropToPlate(png) {
  const fail = { ok: false, png };
  try {
    const { width, height } = await sharp(png).metadata();
    const { data } = await sharp(png)
      .removeAlpha()
      .resize(GRID, GRID, { fit: "fill" })
      .blur(1.5)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const plate = findPlate(data);
    if (!plate?.whole) return fail;
    const sq = plate.square;
    if (!sq) return { ok: true, png };
    const sx = width / GRID;
    const sy = height / GRID;
    const left = Math.floor(sq.left * sx);
    const top = Math.floor(sq.top * sy);
    const cropped = await sharp(png)
      .extract({
        left,
        top,
        width: Math.min(Math.ceil(sq.side * sx), width - left),
        height: Math.min(Math.ceil(sq.side * sy), height - top),
      })
      .resize(width, height, { fit: "fill" })
      .png()
      .toBuffer();
    return { ok: true, png: cropped };
  } catch {
    return fail;
  }
}
