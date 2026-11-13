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
    buffer: PNG.sync.write(diff),
  };
}
