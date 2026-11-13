import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contextOptions } from "../site-check/browser.mjs";
import { fullPageCapture } from "../capture-page.mjs";
import { safeUrl } from "../site-check/core.mjs";
import { hash, inScope } from "./core.mjs";
export async function captureInventoryPage(
  browser,
  row,
  device,
  viewport,
  out,
  base,
  file,
) {
  const c = { device, status: "ok" };
  const context = await browser.newContext({
    ...contextOptions({ device, viewport }),
    reducedMotion: "reduce",
  });
  try {
    await context.route("**/*", async (route) => {
      const req = route.request();
      if (!["GET", "HEAD"].includes(req.method())) return route.abort();
      if (
        req.isNavigationRequest() &&
        req.frame().parentFrame() === null &&
        !inScope(req.url(), base)
      )
        return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    await page.bringToFront();
    const response = await page.goto(row.url, {
      waitUntil: "load",
      timeout: 30000,
    });
    if (!response?.ok()) throw Error(`HTTP ${response?.status()}`);
    if (
      /just a moment|access denied|attention required/i.test(await page.title())
    )
      throw Error("Access challenge");
    const capture = await fullPageCapture(page);
    c.file = file;
    await writeFile(resolve(out.dir, c.file), capture.buffer);
    Object.assign(c, {
      sha256: hash(capture.buffer),
      url: row.url,
      finalUrl: safeUrl(page.url()),
      capturedAt: new Date().toISOString(),
      viewport,
      width: capture.buffer.readUInt32BE(16),
      height: capture.buffer.readUInt32BE(20),
      attempts: capture.attempts,
      scope: "Full page",
    });
  } catch (e) {
    c.status = "error";
    c.error = e.message;
  } finally {
    await context.close();
  }

  return c;
}
