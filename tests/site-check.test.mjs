import AxeBuilder from "@axe-core/playwright";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import {
  options,
  targets,
  stats,
  rotate,
  redact,
  evidence,
  request,
  performanceSummary,
  aggregatePerformance,
  cacheState,
} from "../scripts/site-check/core.mjs";
import { sitemapEntries } from "../scripts/site-check/sitemap.mjs";
import { report } from "../scripts/site-check/report.mjs";
import {
  chromium,
  inspect,
  browserLoads,
} from "../scripts/site-check/browser.mjs";

test("reject invalid options and unknown pages before measuring", () => {
  assert.throws(() => options(["--tier", "unknown"]));
  assert.throws(() => options(["--modules", "wat"]));
  assert.throws(() => options(["--run", "../overwrite"]));
  assert.throws(() =>
    targets(
      { pages: [{ id: "home" }], devices: { mobile: {} } },
      { pages: ["typo"] },
    ),
  );
  assert.deepEqual(rotate(["before", "after"], 1), ["after", "before"]);
});
test("statistics handle nulls, even sample counts and incomplete repetitions honestly", () => {
  assert.deepEqual(stats([null, 4, 2]), { n: 2, median: 3, min: 2, max: 4 });
  assert.equal(stats([null]), null);
  const target = { page: "home", device: "mobile", side: "before" };
  const rows = [
    {
      target,
      status: "ok",
      result: {
        scores: { performance: 82 },
        metrics: { "largest-contentful-paint": 1200 },
      },
    },
    { target, status: "error", error: "failed" },
  ];
  assert.equal(aggregatePerformance(rows)[0].runs, 1);
  assert.equal(aggregatePerformance(rows)[0].performance.median, 82);
  assert.throws(() => performanceSummary({ runtimeError: { code: "NO_FCP" } }));
  assert.equal(
    performanceSummary({ categories: { performance: { score: null } } }).scores
      .performance,
    null,
  );
  assert.equal(
    cacheState({ "cache-control": "private", "x-cache": "HIT" }),
    "private/no-store",
  );
});
test("evidence excludes credentials and refuses even an empty existing run", async () => {
  const temp = await mkdtemp(join(tmpdir(), "site-check-"));
  try {
    assert.equal(
      redact({ name: "set-cookie", value: "session=secret" }).value,
      "[redacted]",
    );
    const value = redact(
      {
        authorization: "Bearer abc",
        nested: {
          "set-cookie": "secret=value",
          url: "https://user:pass@example.com/?token=abc&x=1",
          message: "test-key-123",
        },
      },
      "test-key-123",
    );
    assert.equal(value.authorization, undefined);
    assert.equal(value.nested["set-cookie"], undefined);
    assert.ok(!JSON.stringify(value).includes("abc"));
    assert.ok(!JSON.stringify(value).includes("user:pass"));
    assert.ok(!JSON.stringify(value).includes("test-key-123"));
    const out = await evidence(temp, "once");
    await assert.rejects(evidence(temp, "once"), { code: "EEXIST" });
    await out.json("sample.json", { cookie: "hidden", value: "safe" });
    assert.deepEqual(
      JSON.parse(await readFile(join(out.dir, "sample.json"), "utf8")),
      { value: "safe" },
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("sitemaps parse URL sets and indexes without permitting document-defined entities", () => {
  assert.deepEqual(
    sitemapEntries(
      "<urlset><url><loc>https://example.com/a</loc></url></urlset>",
    ),
    { type: "urls", urls: ["https://example.com/a"] },
  );
  assert.deepEqual(
    sitemapEntries(
      "<sitemapindex><sitemap><loc>https://example.com/one.xml</loc></sitemap></sitemapindex>",
    ).type,
    "index",
  );
  assert.throws(() => sitemapEntries("<html>not a sitemap</html>"));
  assert.throws(() => sitemapEntries("<urlset>"));
  assert.throws(() =>
    sitemapEntries('<!DOCTYPE urlset [<!ENTITY x "secret">]><urlset/>'),
  );
  assert.equal(
    sitemapEntries(
      "<urlset><url><loc>https://example.com/?a=1&amp;b=2</loc></url></urlset>",
    ).urls[0],
    "https://example.com/?a=1&b=2",
  );
});
test("public HTTP and browser checks: redirects, failed pages, axe, keyboard recovery and repeat loads", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/" });
      return res.end();
    }
    if (req.url === "/failed") {
      res.writeHead(503);
      return res.end("Unavailable");
    }
    if (req.url === "/large") {
      return res.end("x".repeat(10000));
    }
    if (req.url === "/no-heading") {
      res.setHeader("Content-Type", "text/html");
      return res.end("<title>Missing heading</title><p>Empty content</p>");
    }
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Set-Cookie", "session=do-not-save");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.end(
      `<!doctype html><html lang="en"><head><title>Fixture</title><link rel="canonical" href="/"><meta name="robots" content="noindex"></head><body><header><a href="#main">Skip to content</a><button aria-expanded="false" aria-controls="menu" aria-label="Menu">Menu</button><nav id="menu" hidden><a href="/">Home</a></nav></header><main id="main" tabindex="-1"><h1>Test page</h1><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII="><form action="/receive" method="post"></form></main><script>const b=document.querySelector('button'),m=document.querySelector('nav');b.onclick=()=>{const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',open);m.hidden=!open};document.addEventListener('keydown',e=>{if(e.key==='Escape'){b.setAttribute('aria-expanded','false');m.hidden=true;b.focus()}})</script></body></html>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`,
    browser = await chromium.launch();
  try {
    const r = await request(base + "/redirect", { body: true });
    assert.equal(r.chain.length, 2);
    assert.equal(r.status, 200);
    assert.equal(r.headers["set-cookie"], undefined);
    await assert.rejects(
      request(base + "/large", { body: true, maxBytes: 100 }),
      /exceeds/,
    );
    const target = {
      url: base + "/",
      page: "home",
      label: "Home",
      side: "before",
      device: "mobile",
      viewport: { width: 390, height: 844 },
    };
    const x = await inspect(browser, target, {
      accessibility: true,
      standard: true,
    });
    assert.equal(x.metadata.title, "Fixture");
    assert.deepEqual(x.metadata.robots, ["noindex"]);
    assert.ok(x.accessibility.violations.some((v) => v.id === "image-alt"));
    assert.equal(x.accessibility.keyboard.skip.status, "ok");
    assert.equal(x.accessibility.keyboard.menu.status, "ok");
    assert.equal(x.headers["set-cookie"], undefined);
    await assert.rejects(
      inspect(browser, { ...target, url: base + "/failed" }),
      /HTTP 503/,
    );
    await assert.rejects(
      inspect(browser, { ...target, url: base + "/no-heading" }),
      /No visible main heading/,
    );
    const loads = await browserLoads(browser, {
      ...target,
      url: base + "/redirect",
    });
    assert.deepEqual(
      loads.map((l) => l.mode),
      ["cold", "repeat"],
    );
    assert.ok(loads[0].requests > 0);
    assert.ok(loads[0].resources.some((r) => r.status === 302));
    assert.ok(loads[0].resources.some((r) => r.status === 200));
    const data = {
      project: {
        name: "<script>bad</script>",
        labels: { before: "Before", after: "After" },
        beforeBase: base,
        afterBase: base,
      },
      options: { tier: "minimal", modules: ["accessibility"] },
      preflight: [{ target, status: "ok" }],
      results: {
        accessibility: [{ target, status: "ok", result: x.accessibility }],
      },
      startedAt: "test",
      state: "complete",
      durationMs: 10,
    };
    const html = report(data);
    assert.ok(!html.includes("<script>bad</script>"));
    assert.ok(html.includes("image-alt"));
    const reportContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await reportContext.newPage();
    await page.setContent(html);
    assert.equal(
      await page.locator("h1").innerText(),
      "<script>bad</script> — Site check",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .locator("details")
      .evaluateAll((ds) => ds.forEach((d) => (d.open = true)));
    const reportScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      reportScan.violations.map((v) => v.id),
      [],
    );
    await reportContext.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("PageSpeed keeps key out of URLs, handles missing visitor data and reports quota failures", async () => {
  const { pagespeed } = await import("../scripts/site-check/performance.mjs");
  const target = { url: "https://example.com/", device: "mobile" };
  const result = await pagespeed(target, "secret-key", async (url, init) => {
    assert.ok(!url.href.includes("secret-key"));
    assert.equal(init.headers["X-Goog-Api-Key"], "secret-key");
    return new Response(
      JSON.stringify({
        lighthouseResult: {
          lighthouseVersion: "test",
          categories: { performance: { score: 0.9 } },
          audits: {},
        },
      }),
    );
  });
  assert.equal(result.summary.scores.performance, 90);
  assert.equal(result.summary.field.page, null);
  await assert.rejects(
    pagespeed(
      target,
      "secret-key",
      async () => new Response("not saved", { status: 429 }),
    ),
    /PageSpeed HTTP 429/,
  );
});

test("live-site records check one real site and reject off-site paths", async () => {
  const { validateSiteCheckProject } =
    await import("../scripts/site-check/core.mjs");
  for (const id of ["velocity", "unitedstats"]) {
    const record = JSON.parse(
      await readFile(
        new URL(`../projects/${id}/project.json`, import.meta.url),
        "utf8",
      ),
    );
    const project = validateSiteCheckProject(record),
      all = targets(project, options([]));
    assert.equal(all.length, 10);
    assert.ok(all.every((t) => t.side === "live"));
    assert.equal(new Set(all.map((t) => new URL(t.url).origin)).size, 1);
    assert.throws(() =>
      validateSiteCheckProject({
        ...record,
        pages: [{ id: "escape", label: "Escape", path: "//evil.example/" }],
      }),
    );
    assert.throws(() =>
      validateSiteCheckProject({
        ...record,
        site: { ...record.site, baseUrl: "https://user:pass@example.com" },
      }),
    );
  }
});

test("reports identify origin fallback and do not turn missing timings into zero", () => {
  const target = {
    page: "home",
    label: "Home",
    url: "https://example.com/",
    side: "live",
    device: "mobile",
  };
  const html = report({
    project: {
      name: "Live site",
      labels: { live: "Live website" },
      sites: [{ id: "live", baseUrl: "https://example.com/" }],
    },
    options: { tier: "minimal", modules: ["performance"] },
    preflight: [],
    startedAt: "test",
    state: "complete",
    durationMs: 1,
    results: {
      performance: [
        {
          target,
          status: "ok",
          result: {
            scores: { performance: null },
            metrics: { "largest-contentful-paint": null },
            field: {
              page: {
                origin_fallback: true,
                metrics: {
                  CUMULATIVE_LAYOUT_SHIFT_SCORE: {
                    percentile: 5,
                    category: "FAST",
                  },
                },
              },
            },
          },
        },
      ],
    },
  });
  assert.ok(html.includes("Origin visitor data"));
  assert.ok(!html.includes("Page visitor data"));
  assert.ok(html.includes("Layout movement: 0.05"));
  assert.ok(!html.includes("LCP 0.00"));
});

test("collector provenance detects source changes and excludes local secrets", async () => {
  const { collectorFiles, collectorProvenance } =
    await import("../scripts/site-check/provenance.mjs");
  const { mkdir, writeFile, copyFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const temp = await mkdtemp(join(tmpdir(), "site-check-provenance-"));
  try {
    for (const file of collectorFiles) {
      await mkdir(dirname(join(temp, file)), { recursive: true });
      await copyFile(file, join(temp, file));
    }
    const before = await collectorProvenance(temp);
    await writeFile(
      join(temp, ".env"),
      "PAGESPEED_INSIGHTS_API_KEY=never-archive-this",
    );
    assert.deepEqual(await collectorProvenance(temp), before);
    assert.ok(!JSON.stringify(before).includes("never-archive-this"));
    await writeFile(
      join(temp, "scripts/site-check/performance.mjs"),
      "// changed collector",
    );
    assert.notEqual((await collectorProvenance(temp)).sha256, before.sha256);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
