import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { readFile, mkdir, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

await mkdir("output/verification", { recursive: true });
await mkdir("output/pdf", { recursive: true });
const project = JSON.parse(await readFile("public/project.json"));
const manifest = JSON.parse(await readFile("public/captures/manifest.json"));
for (const page of project.pages)
  for (const device of Object.keys(project.devices))
    for (const side of ["before", "after"]) {
      const c = manifest.captures[`${page.id}-${device}-${side}`];
      assert(c, `Missing ${page.id} ${device} ${side}`);
      const data = await readFile(`public/${c.src}`);
      assert.equal(createHash("sha256").update(data).digest("hex"), c.sha256);
      assert.equal(data.readUInt32BE(16), c.viewport.width);
      assert.equal(data.readUInt32BE(20), c.viewport.height);
      assert.deepEqual(c.viewport, project.devices[device]);
    }
console.log(
  "PASS: all 16 captures match manifest hashes and viewport dimensions",
);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    ).replace(/^\/review\//, "");
    const file = resolve("dist", path || "index.html");
    if (!file.startsWith(resolve("dist") + "/")) throw Error("Outside build");
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/review/`;
const browser = await chromium.launch();
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  acceptDownloads: true,
  reducedMotion: "reduce",
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort(),
);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const waitReady = async (p) => {
  await p.locator(".image-button img").first().waitFor();
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() =>
    [...document.querySelectorAll(".image-button img")].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
};
const click = (name) => page.getByRole("button", { name, exact: true }).click();
try {
  await page.goto(url);
  await waitReady(page);
  assert.equal(await page.locator(".capture-card").count(), 2);
  await page.screenshot({
    path: "output/verification/desktop.png",
    fullPage: true,
  });
  const desktopAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    desktopAxe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page.locator(":focus").textContent(),
    "Skip to comparison",
  );
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(":focus").getAttribute("id"), "comparison");
  for (const p of project.pages) {
    await page.locator(`[data-page="${p.id}"]`).click();
    await waitReady(page);
    assert.match(
      await page.locator(".review-heading h2").textContent(),
      new RegExp(p.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  await page.locator('[data-page="home"]').click();
  await click("Toggle");
  await click("Before");
  assert.equal(await page.locator(".capture-card").count(), 1);
  assert(await page.locator(".capture-card.before").count());
  await click("After");
  await click("Side by side");
  await page
    .getByRole("button", { name: "Enlarge after Home capture" })
    .click();
  assert(await page.locator("#inspector").evaluate((d) => d.open));
  for (const viewport of [
    { width: 1543, height: 983 },
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    assert(
      await page.locator(".inspector-scroll").evaluate((stage) => {
        const image = stage.querySelector("img").getBoundingClientRect();
        const box = stage.getBoundingClientRect();
        const dialog = document
          .querySelector("#inspector")
          .getBoundingClientRect();
        return (
          image.width <= stage.clientWidth + 1 &&
          image.height <= stage.clientHeight + 1 &&
          image.top >= box.top &&
          image.bottom <= box.bottom + 1 &&
          stage.scrollWidth <= stage.clientWidth + 1 &&
          stage.scrollHeight <= stage.clientHeight + 1 &&
          dialog.top >= 0 &&
          dialog.bottom <= innerHeight
        );
      }),
      `Inspector must fit at ${viewport.width} x ${viewport.height}`,
    );
  }
  await page.setViewportSize({ width: 1543, height: 983 });
  await page.screenshot({ path: "output/verification/inspector-fit.png" });
  await click("Original size");
  assert(
    await page
      .locator(".inspector-scroll")
      .evaluate((s) => s.scrollHeight > s.clientHeight),
  );
  await click("Fit to screen");
  assert.equal(
    await page.locator('[data-zoom="fit"]').getAttribute("aria-pressed"),
    "true",
  );
  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#inspector").evaluate((d) => d.open), false);
  await page.locator(".edit-notes").focus();
  await page.keyboard.press("Enter");
  assert(await page.locator("#editor").evaluate((d) => d.open));
  const dialogAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    dialogAxe.violations.map((v) => v.id),
    [],
  );
  await page
    .getByRole("textbox", { name: "The proposed change" })
    .fill("Verified edit: a warmer welcome for members.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await page.reload();
  await waitReady(page);
  assert.match(
    await page.locator(".notes-grid").textContent(),
    /Verified edit/,
  );
  const pdfDownload = page.waitForEvent("download", { timeout: 60000 });
  await click("Export PDF");
  const editedPdf = await pdfDownload;
  await editedPdf.saveAs("output/verification/edited-notes.pdf");
  await click("Project notes");
  const backup = page.waitForEvent("download");
  await click("Download notes");
  const notesFile = await backup;
  await notesFile.saveAs("output/verification/notes.json");
  await page.locator("#import-notes").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  await page.waitForFunction(() =>
    document
      .querySelector("#manager-status")
      .textContent.startsWith("Import failed"),
  );
  assert.match(
    await page.locator("#manager-status").textContent(),
    /Import failed/,
  );
  await page.locator("#import-notes").setInputFiles({
    name: "foreign.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 1, projectId: "other", pages: {} }),
    ),
  });
  await page.waitForFunction(() =>
    document
      .querySelector("#manager-status")
      .textContent.startsWith("Import failed"),
  );
  assert.match(
    await page.locator("#manager-status").textContent(),
    /Import failed/,
  );
  await click("Reset all notes");
  await click("Keep my notes");
  assert.match(
    await page.locator(".notes-grid").textContent(),
    /Verified edit/,
  );
  await click("Reset all notes");
  await click("Yes, reset notes");
  await click("Project notes");
  await page
    .locator("#import-notes")
    .setInputFiles("output/verification/notes.json");
  await page.waitForFunction(() =>
    document
      .querySelector("#manager-status")
      .textContent.startsWith("Notes imported"),
  );
  assert.match(
    await page.locator("#manager-status").textContent(),
    /Notes imported/,
  );
  await page.keyboard.press("Escape");
  assert.match(
    await page.locator(".notes-grid").textContent(),
    /Verified edit/,
  );
  await click("Project notes");
  await click("Reset all notes");
  await click("Yes, reset notes");
  const canonical = page.waitForEvent("download", { timeout: 60000 });
  await click("Export PDF");
  await (
    await canonical
  ).saveAs("output/pdf/research-network-comparison-desktop.pdf");
  await page.waitForFunction(() => !document.querySelector("#export").disabled);
  await click("Mobile");
  await waitReady(page);
  const mobilePdf = page.waitForEvent("download", { timeout: 60000 });
  await click("Export PDF");
  await (
    await mobilePdf
  ).saveAs("output/pdf/research-network-comparison-mobile.pdf");
  await page.setViewportSize({ width: 390, height: 844 });
  await waitReady(page);
  await page.waitForFunction(
    () => !document.querySelector("#notice").textContent,
  );
  await page.screenshot({
    path: "output/verification/mobile.png",
    fullPage: true,
  });
  const mobileAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    mobileAxe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const d of ["Desktop", "Mobile"]) {
      await click(d);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `Overflow at ${width} / ${d}`,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await click("Desktop");
  await waitReady(page);
  await page.screenshot({
    path: "output/verification/mobile-desktop-captures.png",
    fullPage: true,
  });
  // Capture failure is visible and retry recovers without losing notes.
  await page.route("**/captures/home-mobile-before.png", (r) => r.abort());
  await click("Mobile");
  await page.reload();
  await page.locator(".image-error:not([hidden])").waitFor();
  await page.unroute("**/captures/home-mobile-before.png");
  await page.getByRole("button", { name: "Retry image" }).click();
  await waitReady(page);
  // PDF failure releases the control and permits a successful retry.
  await page.route("**/captures/events-mobile-after.png", (r) => r.abort());
  await click("Export PDF");
  await page.waitForFunction(() =>
    document
      .querySelector("#notice")
      .textContent.startsWith("PDF export failed"),
  );
  assert.equal(await page.locator("#export").isDisabled(), false);
  await page.unroute("**/captures/events-mobile-after.png");
  const retry = page.waitForEvent("download", { timeout: 60000 });
  await click("Export PDF");
  await (await retry).saveAs("output/verification/retried.pdf");
  console.log(
    "PASS: static subdirectory build, navigation, devices, views, inspector, persistence, import/reset and PDF success/failure/retry",
  );
  const blocked = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await blocked.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw Error("Storage unavailable");
    };
  });
  const recovery = await blocked.newPage();
  await recovery.goto(url);
  await waitReady(recovery);
  await recovery.locator(".edit-notes").click();
  await recovery
    .getByRole("textbox", { name: "The proposed change" })
    .fill("Unsaved recovery note");
  await recovery.getByRole("button", { name: "Save notes" }).click();
  assert.match(
    await recovery.locator("#notice").textContent(),
    /could not save/,
  );
  assert.match(
    await recovery.locator(".notes-grid").textContent(),
    /Unsaved recovery note/,
  );
  await recovery
    .getByRole("button", { name: "Project notes", exact: true })
    .click();
  const recoveryDownload = recovery.waitForEvent("download");
  await recovery
    .getByRole("button", { name: "Download notes", exact: true })
    .click();
  await (
    await recoveryDownload
  ).saveAs("output/verification/storage-recovery.json");
  await blocked.close();
  const failed = await browser.newContext();
  const fallback = await failed.newPage();
  await fallback.route("**/project.json", (r) => r.abort());
  await fallback.goto(url);
  await fallback.getByRole("button", { name: "Try again" }).waitFor();
  await fallback.unroute("**/project.json");
  await fallback.getByRole("button", { name: "Try again" }).click();
  await waitReady(fallback);
  await failed.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: unavailable storage preserves downloadable edits; initial-load retry; no uncaught browser errors",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
