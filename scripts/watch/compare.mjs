import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
export function compareCaptures(
  beforeBuffer,
  afterBuffer,
  { pixelThreshold = 0.15, maxChangedRatio = 0 } = {},
) {
  const before = PNG.sync.read(beforeBuffer),
    after = PNG.sync.read(afterBuffer);
  const width = Math.max(before.width, after.width),
    height = Math.max(before.height, after.height);
  if (width * height > 24000000)
    throw new Error("Comparison exceeds 24 million pixels");
  const pad = (image) => {
    if (image.width === width && image.height === height) return image;
    const p = new PNG({ width, height, fill: true });
    p.data.fill(255);
    PNG.bitblt(image, p, 0, 0, image.width, image.height, 0, 0);
    return p;
  };
  const a = pad(before),
    b = pad(after),
    diff = new PNG({ width, height });
  const changedPixels = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: pixelThreshold,
    includeAA: false,
    alpha: 0.25,
  });
  const dimensionsChanged =
    before.width !== after.width || before.height !== after.height;
  const ratio = changedPixels / (width * height);
  return {
    width,
    height,
    before: { width: before.width, height: before.height },
    after: { width: after.width, height: after.height },
    dimensionsChanged,
    changedPixels,
    changedRatio: ratio,
    changed: dimensionsChanged || ratio > maxChangedRatio,
    region: changedBands(diff),
    buffer: PNG.sync.write(diff),
  };
}

// Where on the page the changes are: horizontal bands of changed rows,
// merged across small gaps, so a report can open at the first change.
// Changed pixels are the ones pixelmatch paints pure red.
export function changedBands(diff, { gap = 24, limit = 12 } = {}) {
  const { width, height, data } = diff,
    bands = [];
  for (let y = 0; y < height; y++) {
    let hit = false;
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4)
      if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 0) {
        hit = true;
        break;
      }
    if (!hit) continue;
    const last = bands.at(-1);
    if (last && y - last[1] <= gap) last[1] = y + 1;
    else bands.push([y, y + 1]);
  }
  // Keep the largest bands when there are many, in page order.
  const kept =
    bands.length > limit
      ? bands
          .map((b, i) => [...b, i])
          .sort((a, b) => b[1] - b[0] - (a[1] - a[0]))
          .slice(0, limit)
          .sort((a, b) => a[2] - b[2])
          .map(([t, b]) => [t, b])
      : bands;
  return bands.length
    ? { height, top: bands[0][0], bottom: bands.at(-1)[1], bands: kept }
    : { height, top: null, bottom: null, bands: [] };
}
