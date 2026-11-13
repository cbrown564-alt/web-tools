import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import * as fx from "./fixtures/reports.mjs";
import { report as siteCheckReport } from "../scripts/site-check/report.mjs";
import { watchReport } from "../scripts/watch/report.mjs";
import { inventoryReport } from "../scripts/inventory/report.mjs";
import { redirectReport } from "../scripts/content/report.mjs";
import { releaseReport } from "../scripts/release/report.mjs";
import { writeMaximumReport } from "../scripts/site-check/maximum-report.mjs";

const root = resolve(import.meta.dirname, "..");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function everyReport() {
  const dir = await mkdtemp(join(tmpdir(), "wt-reports-"));
  const viaFile = async (write, data) => {
    await write(dir, data);
    return readFile(join(dir, "report.html"), "utf8");
  };
  const reports = {
    "site check": siteCheckReport(fx.siteCheck),
    "watch, nothing changed": watchReport(fx.watchQuiet),
    "watch, changes": watchReport(fx.watchChanged),
    inventory: inventoryReport(fx.inventory),
    "redirect check": redirectReport(fx.redirectCheck),
    "release package": await viaFile(releaseReport, fx.releasePack),
    "form tests": await viaFile(releaseReport, fx.releaseForms),
    investigation: await viaFile(writeMaximumReport, fx.maximum),
  };
  await rm(dir, { recursive: true });
  return reports;
}

// Things a client should never have to read before the findings.
const FORBIDDEN = {
  hash: /\b[a-f0-9]{12,}\b/,
  "ISO timestamp": /\d{4}-\d{2}-\d{2}T\d{2}/,
  "run name": /\b20\d{2}-\d{2}-\d{2}-[a-z]/,
  "rule id":
    /\b(color-contrast|image-alt|aria-[a-z-]+|strict-transport-security|referrer-policy|content-security-policy|x-content-type-options|survey-script|hero-visible)\b/,
  "raw file": /\b[a-z-]+\.jsonl?\b/,
  "machine state": /\b(baseline-required|packaged|rehearsed)\b/,
};

test("the first screen of every report is three plain blocks at desktop and phone sizes", async () => {
  const reports = await everyReport();
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      for (const [name, html] of Object.entries(reports)) {
        await page.setContent(html);
        const at = `${name} at ${viewport.width}×${viewport.height}`;
        assert.deepEqual(
          await page.locator(".lead h2").allInnerTexts(),
          ["What was checked", "What was found", "What needs a decision"],
          at,
        );
        // The lead is the first thing in the page.
        assert.equal(
          await page.evaluate(
            () => document.querySelector("main").firstElementChild.className,
          ),
          "lead",
          at,
        );
        const visible = await page.evaluate(() => {
          const out = [];
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
          );
          for (let n; (n = walker.nextNode());) {
            const el = n.parentElement;
            if (!n.textContent.trim() || !el.checkVisibility()) continue;
            if (el.closest("script,style")) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const r of range.getClientRects())
              if (r.top < innerHeight && r.bottom > 0 && r.width && r.height) {
                out.push(n.textContent);
                break;
              }
          }
          return out.join(" ");
        });
        assert.ok(visible.includes("What was checked"), at);
        for (const [what, pattern] of Object.entries(FORBIDDEN))
          assert.ok(
            !pattern.test(visible),
            `${at}: first screen shows a ${what}: ${pattern.exec(visible)?.[0]}`,
          );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${at}: page scrolls sideways`,
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test("findings are grouped by cause, ordered by consequence and linked to evidence", async () => {
  const html = siteCheckReport(fx.siteCheck);
  const lead = /<header class="lead">.*?<\/header>/s.exec(html)[0];
  // One entry for contrast although it is on four page and device combinations.
  assert.equal(lead.split("hard to read against its background").length, 2);
  assert.match(lead, /Where: Home; Gallery/);
  // Mobile-only slowness names the device; an all-device finding does not.
  assert.match(lead, /Home \(mobile\): 41 out of 100/);
  const order = [
    "Search engines are told not to list",
    "Pages load slowly",
    "Browsers are not told to always use the secure connection",
  ].map((s) => lead.indexOf(s));
  assert.ok(order.every((n) => n > 0));
  assert.ok(order[0] < order[2] && order[1] < order[2]);
  assert.match(lead, /href="#accessibility">See the evidence/);
  assert.match(
    lead,
    /Ask whoever manages hosting to add the missing security headers/,
  );
  // Rule ids stay available in the detail.
  assert.ok(html.includes("color-contrast"));
  assert.ok(!lead.includes("color-contrast"));
});

test("a quiet watch says so in one line and holds small differences below the fold", () => {
  const html = watchReport(fx.watchQuiet);
  const lead = /<header class="lead">.*?<\/header>/s.exec(html)[0];
  assert.match(
    lead,
    /<h2>What was found<\/h2><p>Nothing changed since the version accepted on 12 November 2026, 17:12\.<\/p>/,
  );
  assert.match(lead, /<h2>What needs a decision<\/h2><p>Nothing\.<\/p>/);
  assert.ok(!lead.includes("very small visual difference"));
  assert.match(
    html,
    /<details><summary>Very small differences that need no review \(1\)<\/summary>/,
  );
  const changed = watchReport(fx.watchChanged);
  assert.match(changed, /A script the site depends on is no longer loaded/);
  assert.match(changed, /wt watch fixture accept --run 2026-11-13-watch-02/);
  assert.ok(!changed.includes("npm run"));
});

test("no report carries an approval or launch-status disclaimer", async () => {
  for (const [name, html] of Object.entries(await everyReport()))
    assert.ok(
      !/not (yet )?approved|client approval|for discussion|not (yet )?launched|production launch|sign-?off/i.test(
        html.replace(/<section class="operator.*?<\/section>/gs, ""),
      ),
      name,
    );
});

function wt(cwd, args) {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [join(root, "scripts/wt.mjs"), ...args],
      {
        env: { ...process.env, WT_ROOT: cwd, PROJECT: "" },
      },
    );
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.once("error", fail);
    child.once("close", (code) => done({ code, output }));
  });
}

test("wt share writes a portable bundle with nothing internal and nothing from another project", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wt-share-"));
  const record = (id) => ({
    version: 2,
    kind: "site-check",
    id,
    name: id,
    site: {
      id: "live",
      label: "Live website",
      baseUrl: "https://www.fixture.example",
    },
    pages: [{ id: "home", label: "Home", path: "/" }],
    devices: { desktop: { width: 900, height: 700 } },
  });
  const put = async (file, data) => {
    await mkdir(join(dir, file, ".."), { recursive: true });
    await writeFile(
      join(dir, file),
      Buffer.isBuffer(data) ? data : JSON.stringify(data),
    );
  };
  const run = `projects/fixture/evidence/${fx.watchChanged.run}`;
  await put("projects/fixture/project.json", record("fixture"));
  await put("projects/other/project.json", record("other"));
  await put("projects/other/evidence/2026-11-13-watch-01/results.json", {
    ...fx.watchQuiet,
    project: { id: "other", name: "Other client secret" },
  });
  await put(`${run}/results.json`, fx.watchChanged);
  await put(`${run}/conditions.json`, { node: "v24", secret: "internal" });
  await put(`${run}/site-check/results.json`, fx.siteCheck);
  await put(`${run}/site-check/conditions.json`, { node: "v24" });
  for (const i of [0, 1, 2, 3]) {
    await put(`${run}/captures/${i}.png`, PNG);
    await put(`${run}/baseline/${i}.png`, PNG);
  }
  await put(`${run}/diff/0.png`, PNG);
  const browser = await chromium.launch();
  let server;
  try {
    const result = await wt(dir, ["share", "fixture"]);
    assert.equal(result.code, 0, result.output);
    assert.match(
      result.output,
      /Shared bundle: output\/share\/fixture-2026-11-13-watch-02\/index\.html/,
    );
    const bundle = join(dir, "output/share", `fixture-${fx.watchChanged.run}`);
    const files = (
      await readdir(bundle, { recursive: true, withFileTypes: true })
    )
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name).slice(bundle.length + 1))
      .sort();
    assert.ok(files.includes("index.html"));
    assert.ok(files.includes("site-check/report.html"));
    assert.ok(files.includes("captures/0.png"));
    assert.deepEqual([...new Set(files.map((f) => extname(f)))].sort(), [
      ".html",
      ".png",
    ]);
    for (const file of files.filter((f) => f.endsWith(".html"))) {
      const html = await readFile(join(bundle, file), "utf8");
      for (const leak of [
        "conditions.json",
        "results.json",
        "Other client secret",
        "wt watch",
        "For the operator",
        "projects/",
        fx.watchChanged.run,
      ])
        assert.ok(!html.includes(leak), `${file} contains ${leak}`);
      assert.ok(
        !/not (yet )?approved|client approval|for discussion|not (yet )?launched/i.test(
          html,
        ),
      );
    }
    // Served from a plain static host with every other host blocked.
    server = createServer(async (req, res) => {
      try {
        const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
        const body = await readFile(join(bundle, path));
        res.setHeader(
          "content-type",
          path.endsWith(".png") ? "image/png" : "text/html",
        );
        res.end(body);
      } catch {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage();
    const external = [],
      failed = [];
    await page.route("**/*", (route) => {
      if (route.request().url().startsWith(origin)) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    page.on("response", (r) => r.status() >= 400 && failed.push(r.url()));
    for (const path of ["/index.html", "/site-check/report.html"]) {
      await page.goto(origin + path, { waitUntil: "networkidle" });
      assert.equal(await page.locator(".lead h2").count(), 3, path);
      await page
        .locator("details")
        .evaluateAll((ds) => ds.forEach((d) => (d.open = true)));
      await page.waitForLoadState("networkidle");
      assert.ok(
        await page.evaluate(() =>
          [...document.images].every((i) => i.complete && i.naturalWidth > 0),
        ),
        `${path}: an image did not load`,
      );
      // Every local link in the bundle resolves.
      for (const href of await page
        .locator("a[href]")
        .evaluateAll((as) => as.map((a) => a.href)))
        if (href.startsWith(origin) && !href.includes("#"))
          assert.equal((await fetch(href)).status, 200, href);
    }
    assert.deepEqual(external, []);
    assert.deepEqual(failed, []);
    // Archive, restore into a folder with no evidence, and rebuild offline.
    const archived = await wt(dir, ["archive", "fixture"]);
    assert.equal(archived.code, 0, archived.output);
    const file = /Archive: (\S+\.tar\.gz)/.exec(archived.output)[1];
    const refused = await wt(dir, ["restore", "--from", file]);
    assert.equal(refused.code, 1);
    assert.match(refused.output, /never overwrites/);
    const before = await readFile(join(dir, run, "report.html"), "utf8");
    await rm(join(dir, "projects/fixture/evidence"), { recursive: true });
    const restored = await wt(dir, ["restore", "--from", file]);
    assert.equal(restored.code, 0, restored.output);
    assert.match(restored.output, /1 runs, 1 reports rebuilt offline/);
    assert.equal(await readFile(join(dir, run, "report.html"), "utf8"), before);
    assert.ok(
      (
        await readFile(join(dir, "projects/fixture/index.html"), "utf8")
      ).includes(fx.watchChanged.run),
    );
    // A run that does not exist gets a next step, not a stack trace.

    const none = await wt(dir, ["share", "other", "--run", "nothing-here"]);
    assert.equal(none.code, 1);
    assert.match(none.output, /Next: wt status other/);
  } finally {
    server?.close();
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
});
