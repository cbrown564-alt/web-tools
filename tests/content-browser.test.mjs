import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { PNG } from "pngjs";
import { reviewPage } from "../scripts/content/page.mjs";
test("review loop: captures, edits, persistence, downloads/imports, map validation, tab conflicts and storage recovery on desktop/mobile", async () => {
  const manifest = {
    version: 1,
    project: { id: "fixture", name: "Review fixture" },
    inventorySha256: "a".repeat(64),
    inventoryRun: "fixture-run",
    inventoryState: "complete",
    site: { id: "live", baseUrl: "https://example.com" },
    devices: ["desktop", "mobile"],
    pages: ["keep", "rewrite", "old", "gone"].map((name, i) => ({
      url: "https://example.com/" + name,
      title: name[0].toUpperCase() + name.slice(1),
      status: 200,
      template: { group: "Fixture" },
      captures:
        i === 3
          ? []
          : [
              {
                device: "desktop",
                file: i === 1 ? "broken.png" : "capture.png",
                capturedAt: "2026-11-12",
                scope: "Fixture",
              },
              { device: "mobile", file: "capture.png" },
            ],
    })),
  };
  const bundle = (
    await build({
      entryPoints: ["src/content/app.js"],
      bundle: true,
      write: false,
      format: "iife",
    })
  ).outputFiles[0].text;
  const html = reviewPage(manifest, bundle),
    png = new PNG({ width: 800, height: 1000 });
  png.data.fill(240);
  const buffer = PNG.sync.write(png);
  const server = createServer((req, res) => {
    if (req.url === "/capture.png") {
      res.setHeader("Content-Type", "image/png");
      return res.end(buffer);
    }
    if (req.url === "/broken.png") {
      res.statusCode = 404;
      return res.end("Missing");
    }
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`,
    browser = await chromium.launch();
  try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1050 },
        acceptDownloads: true,
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() =>
      document.querySelector("#scope").textContent.includes("4 URLs"),
    );
    await page.locator("#fit").uncheck();
    assert.ok(
      await page
        .locator(".capture-view")
        .evaluate((n) => n.scrollHeight > n.clientHeight),
    );
    await page.locator(".capture-view").evaluate((n) => (n.scrollTop = 100));
    assert.ok(
      await page.locator(".capture-view").evaluate((n) => n.scrollTop > 0),
    );
    await page.locator("#fit").check();
    assert.equal(await page.locator("#decision").inputValue(), "undecided");
    await page.locator("#decision").selectOption("keep");
    await page.locator("#notes").fill('=formula\n<untrusted> "notes"');
    await page.reload();
    assert.equal(await page.locator("#decision").inputValue(), "keep");
    assert.equal(
      await page.locator("#notes").inputValue(),
      '=formula\n<untrusted> "notes"',
    );
    async function download(id) {
      const pending = page.waitForEvent("download");
      await page.locator("#" + id).click();
      return readFile(await (await pending).path(), "utf8");
    }
    const json = await download("json"),
      csv = await download("csv");
    assert.equal(JSON.parse(json).rows[0].decision, "keep");
    assert.ok(csv.includes("'=formula"));
    page.once("dialog", (d) => d.accept());
    await page.locator("#reset").click();
    assert.equal(await page.locator("#decision").inputValue(), "undecided");
    await page.locator("#import").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(json),
    });
    await page.waitForFunction(
      () => document.querySelector("#decision").value === "keep",
    );
    assert.equal(await page.locator("#decision").inputValue(), "keep");
    await page.locator("#import").setInputFiles({
      name: "foreign.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        json.replace('"projectId": "fixture"', '"projectId": "foreign"'),
      ),
    });
    assert.match(await page.locator("#message").textContent(), /Import failed/);
    assert.equal(await page.locator("#decision").inputValue(), "keep");
    await page
      .getByRole("button", { name: "Old — undecided", exact: true })
      .click();
    await page.locator("#decision").selectOption("consolidate");
    await page.locator("#map").click();
    assert.match(
      await page.locator("#message").textContent(),
      /needs a destination/,
    );
    await page.locator("#destination").fill("/old");
    await page.locator("#map").click();
    assert.match(await page.locator("#message").textContent(), /itself/);
    await page.locator("#destination").fill("/keep");
    const map = JSON.parse(await download("map"));
    assert.equal(map.rules.length, 2);
    assert.equal(map.complete, false);
    assert.equal(map.rules[1].destination, "https://example.com/keep");
    await page
      .getByRole("button", { name: "Rewrite — undecided", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector("#capture-state")
        .textContent.includes("failed to open"),
    );
    await page
      .getByRole("button", { name: "Gone — undecided", exact: true })
      .click();
    assert.match(
      await page.locator("#capture-state").textContent(),
      /No capture recorded/,
    );
    await page
      .getByRole("button", { name: "Keep — keep", exact: true })
      .click();
    const second = await context.newPage();
    await second.goto(url);
    await second.locator("#notes").fill("Other tab note");
    await page.waitForFunction(() => !document.querySelector("#reload").hidden);
    assert.match(await page.locator("#message").textContent(), /Another tab/);
    assert.notEqual(
      await page.locator("#notes").inputValue(),
      "Other tab note",
    );
    await page.locator("#reload").click();
    assert.equal(await page.locator("#notes").inputValue(), "Other tab note");
    await second.close();
    await page.locator("#import").setInputFiles({
      name: "sheet.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await page.waitForFunction(() =>
      document.querySelector("#notes").value.includes("=formula"),
    );
    assert.equal(
      await page.locator("#notes").inputValue(),
      '=formula\n<untrusted> "notes"',
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width < 800)
        await page.locator("#navigation").evaluate((d) => (d.open = false));
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "overflow " + width,
      );
      if ([390, 1440].includes(width)) {
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        assert.deepEqual(
          axe.violations.map((v) => v.id),
          [],
        );
      }
    }
    await page.evaluate(() => {
      URL.createObjectURL = () => {
        throw Error("Download unavailable fixture");
      };
    });
    await page.locator("#json").click();
    assert.match(
      await page.locator("#message").textContent(),
      /Download unavailable/,
    );
    assert.ok(await page.locator("#notes").inputValue());
    assert.deepEqual(errors, []);
    await context.close();
    const unavailable = await browser.newContext();
    await unavailable.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw Error("Storage disabled fixture");
      };
    });
    const q = await unavailable.newPage();
    await q.goto(url);
    await q.locator("#decision").selectOption("rewrite");
    await q.locator("#notes").fill("Unsaved but downloadable");
    assert.match(
      await q.locator("#message").textContent(),
      /storage is unavailable/,
    );
    const pending = q.waitForEvent("download");
    await q.locator("#json").click();
    const backup = JSON.parse(
      await readFile(await (await pending).path(), "utf8"),
    );
    assert.equal(backup.rows[0].notes, "Unsaved but downloadable");
    await unavailable.close();
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});
