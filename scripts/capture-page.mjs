// Shared settling rules for comparison captures and full-page watch captures.
export async function settleVisibleAssets(page, timeout = 10000) {
  await page.waitForFunction(
    () =>
      document.fonts.status === "loaded" &&
      [...document.images]
        .filter((img) => {
          const r = img.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            r.top < innerHeight &&
            r.bottom > 0 &&
            r.left < innerWidth &&
            r.right > 0
          );
        })
        .every((img) => img.complete),
    null,
    { timeout },
  );
  const broken = await page.locator("img").evaluateAll((images) =>
    images
      .filter((img) => {
        const r = img.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          r.top < innerHeight &&
          r.bottom > 0 &&
          r.left < innerWidth &&
          r.right > 0 &&
          (!img.complete || !img.naturalWidth)
        );
      })
      .map((img) => img.currentSrc || img.src),
  );
  if (broken.length)
    throw new Error(`${broken.length} visible image(s) failed to load`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((img) => {
          const r = img.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            r.top < innerHeight &&
            r.bottom > 0 &&
            r.left < innerWidth &&
            r.right > 0
          );
        })
        .map((img) => img.decode()),
    );
  });
}
async function paint(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
export async function fullPageCapture(
  page,
  { masks = [], maxHeight = 50000, maxPixels = 24000000 } = {},
) {
  // Apply layout-affecting capture styles before measuring, not inside screenshot().
  const style = await page.addStyleTag({
    content: "* { content-visibility: visible !important; }",
  });
  try {
    const viewport = page.viewportSize();
    const heightLimit = Math.min(
      maxHeight,
      Math.floor(maxPixels / viewport.width),
    );
    let lastHeight = 0,
      atBottom = 0,
      steps = 0;
    for (; steps < 150; steps++) {
      const state = await page.evaluate(() => ({
        height: Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
        ),
        y: scrollY,
        viewport: innerHeight,
      }));
      if (state.height > heightLimit)
        throw new Error(
          `Full-page height ${state.height}px exceeds capture limit ${heightLimit}px; no truncated baseline was saved`,
        );
      await settleVisibleAssets(page);
      const bottom = state.y + state.viewport >= state.height - 2;
      if (bottom && state.height === lastHeight) atBottom++;
      else atBottom = 0;
      if (atBottom >= 2) break;
      lastHeight = state.height;
      await page.evaluate(
        (step) => scrollTo(0, scrollY + step),
        Math.floor(viewport.height * 0.8),
      );
      await paint(page);
    }
    if (steps === 150)
      throw new Error("Full page did not settle within 150 scroll steps");
    await page.evaluate(() => scrollTo(0, 0));
    await paint(page);
    await settleVisibleAssets(page);
    const imageState = await page.locator("img").evaluateAll((images) =>
      images
        .filter((img) => {
          const r = img.getBoundingClientRect();
          return (
            r.width > 0 && r.height > 0 && r.left < innerWidth && r.right > 0
          );
        })
        .map((img) => ({
          src: img.currentSrc || img.src,
          complete: img.complete,
          width: img.naturalWidth,
        })),
    );
    if (imageState.some((img) => !img.complete || !img.width))
      throw new Error(
        "A displayed image is still unloaded after the full-page scroll",
      );
    const masked = await Promise.all(
      masks.map(async (selector) => ({
        selector,
        count: await page.locator(selector).count(),
      })),
    );
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) {
          try {
            animation.finish();
          } catch {}
        }
      }
    });
    await paint(page);
    await settleVisibleAssets(page);
    let buffer, attempts;
    for (attempts = 1; attempts <= 3; attempts++) {
      await settleVisibleAssets(page);
      await paint(page);
      buffer = await page.screenshot({
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        mask: masks.map((selector) => page.locator(selector)),
        maskColor: "#e4e4e4",
      });
      if (
        buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > maxPixels ||
        buffer.readUInt32BE(20) > maxHeight
      )
        throw new Error("Rendered capture exceeds the full-page size limit");
      const documentHeight = await page.evaluate(() =>
        Math.max(
          innerHeight,
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
        ),
      );
      if (buffer.readUInt32BE(20) === documentHeight) break;
      if (attempts === 3)
        throw new Error(
          `Document height changed during capture (${buffer.readUInt32BE(20)} to ${documentHeight}); no truncated baseline was saved`,
        );
    }
    return {
      buffer,
      attempts,
      scrollSteps: steps,
      images: imageState,
      masked,
      heightLimit,
    };
  } finally {
    await style.evaluate((node) => node.remove());
  }
}
