import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { collectWatchCapture } from "../scripts/watch/capture.mjs";
import { compareCaptures } from "../scripts/watch/compare.mjs";
import {
  watchPolicy,
  watchState,
  watchSelection,
  createWatchRun,
  acceptBaseline,
  baselineFor,
  loadBaseline,
  watchOptions,
} from "../scripts/watch/core.mjs";
import { checkFindings } from "../scripts/watch.mjs";
import { writeWatchReport } from "../scripts/watch/report.mjs";

const image = (colour) => {
  const png = new PNG({ width: 20, height: 20 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = colour;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
};
test("watch requires an explicit paired site and validates assertions", () => {
  const p = {
    id: "fixture",
    sites: [
      { id: "before", baseUrl: "https://before.example" },
      { id: "after", baseUrl: "https://after.example" },
    ],
    pages: [{ id: "home", label: "Home", beforePath: "/", afterPath: "/" }],
    devices: { desktop: { width: 900, height: 700 } },
  };
  assert.throws(() => watchSelection(p, {}), /Choose --site/);
  assert.equal(watchSelection(p, { site: "after" })[0].side, "after");
  assert.throws(() => watchOptions(["--run", "../bad"]));
  assert.throws(() =>
    watchPolicy(
      {
        ...p,
        watch: {
          assertions: [
            { id: "bad", page: "missing", type: "visible", selector: "h1" },
          ],
        },
      },
      [],
    ),
  );
});
test("pixel comparisons retain small changes and page-size changes", () => {
  const a = image(200),
    b = image(201);
  assert.equal(compareCaptures(a, a).changed, false);
  const png = PNG.sync.read(a);
  png.data[0] = 0;
  assert.equal(compareCaptures(a, PNG.sync.write(png)).changed, true);
  const blank = new PNG({ width: 21, height: 20 });
  blank.data.fill(255);
  assert.equal(
    compareCaptures(a, PNG.sync.write(blank)).dimensionsChanged,
    true,
  );
  assert.equal(compareCaptures(a, b, { pixelThreshold: 0.5 }).changed, false);
});

test("full loop: lazy images, quiet comparison, failure refusal, explicit acceptance, stale commands and tampering", async () => {
  let mode = "good";
  const server = createServer((req, res) => {
    if (req.url === "/image.png") {
      res.setHeader("Content-Type", "image/png");
      return res.end(image(200));
    }
    if (req.url === "/missing.png") {
      res.statusCode = 404;
      return res.end("Missing");
    }
    if (req.url === "/loader.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end("/* local script fixture */");
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<!doctype html><html lang="en"><head><title>Watch fixture</title><meta property="og:title" content="${mode === "attribute" ? "Wrong title" : "Expected title"}"><style>body{margin:0;font:16px sans-serif}main{padding:20px}.space{content-visibility:auto;contain-intrinsic-size:200px}.space::after{content:"";display:block;height:1800px}.gallery{display:${mode === "style" ? "block" : "grid"};grid-template-columns:1fr 1fr}</style>${mode === "script" ? "" : '<script src="/loader.js"></script>'}</head><body><main><h1>${mode === "change" ? "A reviewed change" : "Saved page"}</h1><section class="gallery"><p>First</p><p>Second</p></section><ul class="listing">${mode === "listing" ? "" : "<li>The new article</li>"}</ul><div class="space"></div><img id="lazy" loading="lazy" width="100" height="100" src="${mode === "broken" ? "/missing.png" : "/image.png"}"><p>Page end</p><div style="width:100%;overflow:hidden;position:relative;height:120px"><img style="position:absolute;left:30000px" loading="lazy" width="100" height="100" src="/never-visible.png"></div></main></body></html>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const dir = await mkdtemp(join(tmpdir(), "watch-test-")),
    projectDir = join(dir, "fixture");
  await mkdir(projectDir);
  const browser = await chromium.launch();
  const target = {
    page: "home",
    label: "Home",
    side: "live",
    device: "desktop",
    viewport: { width: 900, height: 700 },
    url: `http://127.0.0.1:${server.address().port}/`,
  };
  const project = {
    id: "fixture",
    name: "Watch fixture",
    pages: [{ id: "home" }],
    devices: { desktop: target.viewport },
    watch: {
      assertions: [
        {
          id: "sharing",
          page: "home",
          type: "attribute",
          selector: 'meta[property="og:title"]',
          attribute: "content",
          equals: "Expected title",
        },
        {
          id: "loader",
          page: "home",
          type: "script",
          selector: 'script[src="/loader.js"]',
        },
        {
          id: "gallery",
          page: "home",
          type: "style",
          selector: ".gallery",
          property: "display",
          equals: "grid",
        },
        {
          id: "new-post",
          page: "home",
          type: "listing",
          selector: ".listing",
          items: ["The new article"],
        },
      ],
    },
  };
  const policy = watchPolicy(project, [target], { siteCheck: false });
  async function run(name) {
    const pointer = await baselineFor(projectDir, "live"),
      baseline = await loadBaseline(projectDir, pointer),
      out = await createWatchRun(projectDir, name);
    const row = await collectWatchCapture(
      browser,
      target,
      policy,
      out,
      baseline,
    );
    const data = {
      tool: "watch",
      version: 1,
      project: { id: "fixture", name: "Watch fixture" },
      run: name,
      site: "live",
      policy,
      baseline: pointer,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      rows: [row],
      siteCheck: { state: "skipped", reason: "Fixture checks only" },
    };
    await out.json("conditions.json", { fixture: true });
    data.state = watchState(data, Boolean(baseline));
    await out.json("results.json", data);
    await writeWatchReport(out.dir, data);
    return { out, data, row };
  }
  try {
    const first = await run("first");
    assert.equal(first.row.status, "ok");
    assert.ok(first.row.capture.height > 2000);
    assert.equal(first.row.capture.imageCount, 1);
    assert.ok(first.row.capture.scrollSteps > 0);
    const pointer = await acceptBaseline(projectDir, "first");
    assert.equal(pointer.run, "first");
    assert.deepEqual(await acceptBaseline(projectDir, "first"), pointer);
    const quiet = await run("quiet");
    assert.equal(quiet.data.state, "quiet");
    assert.equal(quiet.row.diff.changedPixels, 0);
    for (const defect of ["script", "style", "listing", "attribute"]) {
      mode = defect;
      const bad = await run(`defect-${defect}`);
      assert.ok(
        bad.row.assertions.some((a) => a.status === "fail"),
        defect,
      );
      await assert.rejects(
        acceptBaseline(projectDir, `defect-${defect}`),
        /incomplete|fail/,
      );
      assert.equal((await baselineFor(projectDir, "live")).run, "first");
    }
    mode = "broken";
    const broken = await run("broken");
    assert.equal(broken.row.status, "error");
    await assert.rejects(acceptBaseline(projectDir, "broken"));
    mode = "good";
    const restored = await run("restored");
    assert.equal(restored.data.state, "quiet");
    mode = "change";
    const change = await run("change");
    const stale = await run("stale");
    assert.equal(change.data.state, "changed");
    await acceptBaseline(projectDir, "change");
    await assert.rejects(
      acceptBaseline(projectDir, "stale"),
      /Baseline changed/,
    );
    const after = await run("after-accept");
    assert.equal(after.data.state, "quiet");
    await writeFile(join(change.out.dir, change.row.capture.file), image(10));
    const tampered = await run("tampered");
    assert.equal(tampered.row.status, "error");
    assert.match(tampered.row.error, /baseline capture was changed/);
    const invalid = await createWatchRun(projectDir, "incomplete");
    await invalid.json("results.json", {
      ...after.data,
      run: "incomplete",
      state: "running",
      finishedAt: undefined,
    });
    await assert.rejects(
      acceptBaseline(projectDir, "incomplete"),
      /incomplete/,
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("watch state and discrete findings keep collection failures visible without score noise", () => {
  const target = { side: "live", page: "home", device: "mobile" };
  const results = {
    performance: [
      { target, status: "ok", result: { scores: { performance: 20 } } },
    ],
    cache: [],
    accessibility: [
      {
        target,
        status: "ok",
        result: { violations: [{ id: "contrast", nodes: [{}] }] },
      },
    ],
    discovery: [{ target, status: "skipped" }],
  };
  assert.deepEqual(checkFindings({ results }), [
    "accessibility/live/home/mobile: contrast (1 elements)",
    "discovery/live/home/mobile: skipped",
  ]);
  const data = {
    rows: [{ status: "ok", assertions: [], diff: { changed: false } }],
    siteCheck: { state: "complete" },
    siteCheckChanges: [],
  };
  assert.equal(watchState(data, true), "quiet");
  assert.equal(
    watchState({ ...data, siteCheck: { state: "partial" } }, true),
    "failed",
  );
  assert.equal(
    watchState({ ...data, siteCheckChanges: ["New finding"] }, true),
    "changed",
  );
});

test("changed bands merge nearby rows and keep the largest in page order", async () => {
  const { changedBands } = await import("../scripts/watch/compare.mjs");
  const width = 4,
    height = 400,
    data = new Uint8Array(width * height * 4);
  const paint = (from, to) => {
    for (let y = from; y < to; y++) {
      const i = (y * width + 2) * 4;
      data[i] = 255;
      data[i + 3] = 255;
    }
  };
  paint(20, 30);
  paint(40, 46); // within the gap, so joins the first band
  paint(150, 161);
  assert.deepEqual(changedBands({ width, height, data }), {
    height,
    top: 20,
    bottom: 161,
    bands: [
      [20, 46],
      [150, 161],
    ],
  });
  assert.deepEqual(changedBands({ width, height, data }, { limit: 1 }).bands, [
    [20, 46],
  ]);
  assert.deepEqual(
    changedBands({ width, height, data: new Uint8Array(width * height * 4) }),
    { height, top: null, bottom: null, bands: [] },
  );
});
