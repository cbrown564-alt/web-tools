import { chromium } from "playwright";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";

// Preparation is deliberately local. Never send cookies or credentials to the sources.
const project = JSON.parse(await readFile("public/project.json", "utf8"));
const args = new Set(process.argv.slice(2));
const sides = args.has("--after-only") ? ["after"] : ["before", "after"];
const replace = args.has("--replace-baseline");
let manifest = { version: 1, projectId: project.id, captures: {} };
try {
  manifest = JSON.parse(
    await readFile("public/captures/manifest.json", "utf8"),
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await mkdir("public/captures", { recursive: true });
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
          await page.evaluate(async () => {
            await Promise.race([
              Promise.all([
                document.fonts.ready,
                ...[...document.images]
                  .filter((i) => {
                    const r = i.getBoundingClientRect();
                    return (
                      r.width > 0 &&
                      r.height > 0 &&
                      r.top < innerHeight &&
                      r.bottom > 0
                    );
                  })
                  .map((i) => i.decode().catch(() => {})),
              ]),
              new Promise((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        "Visible assets did not settle within 15 seconds",
                      ),
                    ),
                  15000,
                ),
              ),
            ]);
          });
          await page.waitForTimeout(1200);
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
          const target = `public/captures/${key}.png`;
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
            "public/captures/manifest.json",
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
