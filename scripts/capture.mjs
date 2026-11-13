import { settleVisibleAssets } from "./capture-page.mjs";
import { chromium } from "playwright";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadProject, projectId } from "./project.mjs";

// Preparation is deliberately local. Never send cookies or credentials to the sources.
const project = await loadProject();
const dir = `projects/${projectId}/captures`;
const args = new Set(process.argv.slice(2));
const sides = args.has("--after-only") ? ["after"] : ["before", "after"];
const replace = args.has("--replace-baseline");
let manifest = { version: 1, projectId: project.id, captures: {} };
try {
  manifest = JSON.parse(await readFile(`${dir}/manifest.json`, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await mkdir(dir, { recursive: true });
const browser = await chromium.launch();
let failures = 0;
try {
  for (const [device, viewport] of Object.entries(project.devices)) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      locale: "en-GB",
      timezoneId: "Europe/London",
    });
    for (const pageData of project.pages)
      for (const side of sides) {
        const key = `${pageData.id}-${device}-${side}`;
        if (side === "before" && manifest.captures[key] && !replace) {
          console.log(`Preserved ${key}`);
          continue;
        }
        const page = await context.newPage();
        const url = new URL(pageData[`${side}Path`], project[`${side}Base`])
          .href;
        try {
          const response = await page.goto(url, {
            waitUntil: "networkidle",
            timeout: 60000,
          });
          if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
          await settleVisibleAssets(page, 15000);
          const title = await page.title();
          if (/just a moment|access denied|attention required/i.test(title))
            throw new Error(`Challenge page: ${title}`);
          const imageFailures = await page
            .locator("img")
            .evaluateAll((imgs) =>
              imgs
                .filter(
                  (i) =>
                    i.getBoundingClientRect().width > 0 &&
                    i.getBoundingClientRect().height > 0 &&
                    i.getBoundingClientRect().top < innerHeight &&
                    i.getBoundingClientRect().bottom > 0 &&
                    (!i.complete || i.naturalWidth === 0),
                )
                .map((i) => i.src),
            );
          if (imageFailures.length)
            throw new Error(`Visible images failed: ${imageFailures.length}`);
          const target = `${dir}/${key}.png`;
          const buffer = await page.screenshot({ animations: "disabled" });
          await writeFile(`${target}.tmp`, buffer);
          await rename(`${target}.tmp`, target);
          manifest.captures[key] = {
            src: `captures/${key}.png`,
            url,
            resolvedUrl: page.url(),
            title,
            capturedAt: new Date().toISOString(),
            viewport,
            sha256: createHash("sha256").update(buffer).digest("hex"),
            scope: "First viewport; no content removed",
            status: response.status(),
          };
          await writeFile(
            `${dir}/manifest.json`,
            JSON.stringify(manifest, null, 2) + "\n",
          );
          console.log(`Captured ${key}: ${title}`);
        } catch (e) {
          failures++;
          console.error(
            `FAILED ${key}: ${e.message}. Any previous capture is preserved.`,
          );
        } finally {
          await page.close();
        }
      }
    await context.close();
  }
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
