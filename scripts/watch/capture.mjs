import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { contextOptions } from "../site-check/browser.mjs";
import { safeUrl } from "../site-check/core.mjs";
import { fullPageCapture } from "../capture-page.mjs";
import { assertionsFor, copyBaselineImage, digest } from "./core.mjs";
import { compareCaptures } from "./compare.mjs";
export async function collectWatchCapture(
  browser,
  target,
  policy,
  out,
  baseline,
  prepareContext,
) {
  const row = { target, status: "ok", assertions: [] };
  const context = await browser.newContext({
    ...contextOptions(target),
    reducedMotion: "reduce",
  });
  try {
    await prepareContext?.(context);
    const page = await context.newPage();
    await page.bringToFront();
    const response = await page.goto(target.url, {
      waitUntil: "load",
      timeout: 30000,
    });
    if (!response?.ok())
      throw new Error(`HTTP ${response?.status() ?? "no response"}`);
    if (
      /just a moment|access denied|attention required/i.test(await page.title())
    )
      throw new Error("Access challenge");
    row.assertions = await assertionsFor(page, target, policy.assertions);
    const capture = await fullPageCapture(page, policy),
      file = `${target.page}-${target.device}.png`;
    await writeFile(resolve(out.dir, file), capture.buffer);
    const png = PNG.sync.read(capture.buffer);
    row.capture = {
      file,
      sha256: digest(capture.buffer),
      url: safeUrl(target.url),
      finalUrl: safeUrl(page.url()),
      capturedAt: new Date().toISOString(),
      viewport: target.viewport,
      width: png.width,
      height: png.height,
      scope: "Full page",
      scrollSteps: capture.scrollSteps,
      attempts: capture.attempts,
      masked: capture.masked,
      imageCount: capture.images.length,
    };
    row.assertions = await assertionsFor(page, target, policy.assertions);
    if (baseline) {
      const prior = baseline.data.rows.find(
        (r) =>
          r.target.page === target.page &&
          r.target.device === target.device &&
          r.target.side === target.side,
      );
      if (!prior?.capture)
        throw new Error("Accepted baseline has no matching capture");
      const baselineFile = `baseline-${target.page}-${target.device}.png`;
      await copyBaselineImage(baseline, prior, out.dir, baselineFile);
      row.baselineFile = baselineFile;
      const comparison = compareCaptures(
          await readFile(resolve(out.dir, baselineFile)),
          capture.buffer,
          policy,
        ),
        diffFile = `diff-${target.page}-${target.device}.png`;
      await writeFile(resolve(out.dir, diffFile), comparison.buffer);
      const { buffer, ...summary } = comparison;
      row.diff = { ...summary, file: diffFile };
    }
  } catch (error) {
    row.status = "error";
    row.error = error.message;
  } finally {
    await context.close();
  }

  return row;
}
