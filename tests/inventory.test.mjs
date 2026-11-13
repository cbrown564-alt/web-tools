import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  inventoryOptions,
  normalize,
  inspectHtml,
  captureSelection,
  reconcile,
  selectSite,
} from "../scripts/inventory/core.mjs";
import { network } from "../scripts/inventory/network.mjs";
import { crawl } from "../scripts/inventory/crawl.mjs";
import { inventoryReport } from "../scripts/inventory/report.mjs";
test("inventory normalization excludes generators and actions without merging redirect aliases", () => {
  const base = "https://example.com";
  assert.equal(
    normalize("/a/?utm_source=test#x", base, base).url,
    base + "/a/",
  );
  assert.equal(
    normalize("https://www.example.com/a", base, base).url,
    base + "/a",
  );
  for (const p of [
    "/x?add-to-cart=1",
    "/x?token=secret",
    "/logout",
    "/events/category/a/day/2026-11-12/",
    "/private.pdf",
    "/wp-json/users",
    "https://evil.example/a",
    "/x?random=1",
  ])
    assert.ok(normalize(p, base, base).reason, p);
  assert.equal(normalize("/a", base, base).url, base + "/a");
  assert.throws(() => inventoryOptions(["--depth", "6"]));
  assert.throws(() => inventoryOptions(["--max-urls", "NaN"]));
  assert.throws(() => inventoryOptions(["--render", "../outside"]));
});
test("technical probe extracts evidence rather than private form values or alleged plugin versions", () => {
  const r = inspectHtml(
    '<title>A &amp; B</title><meta name="generator" content="WordPress 6.8"><body class="single single-post postid-42"><link rel="canonical" href="/a"><script src="/wp-content/plugins/a/main.js?ver=1.2"></script><script>gtag("config","private-account")</script><form action="/send" method="post"><input name="password" value="DO-NOT-RETAIN"><input name="_nonce" value="secret"></form><a href="/next">Next</a>',
    "https://example.com/a",
  );
  assert.equal(r.title, "A & B");
  assert.equal(r.template.group, "single-post");
  assert.equal(r.probe.plugins[0].name, "a");
  assert.deepEqual(r.probe.plugins[0].assetVersions, ["1.2"]);
  assert.equal(r.probe.trackers[0].name, "Google Analytics");
  assert.equal(r.probe.forms[0].method, "POST");
  assert.ok(!JSON.stringify(r).includes("DO-NOT-RETAIN"));
  assert.ok(!JSON.stringify(r).includes("private-account"));
});
test("bounded HTTP crawl: nested sitemaps, redirects, links, robots, byte sizes, limits and historical differences", async () => {
  const visited = [];
  const server = createServer((req, res) => {
    visited.push(req.url);
    const base = `http://127.0.0.1:${server.address().port}`;
    res.setHeader("Content-Type", "text/html");
    const xml = (body) => {
      res.setHeader("Content-Type", "application/xml");
      res.end(body);
    };
    if (req.url === "/robots.txt") {
      res.setHeader("Content-Type", "text/plain");
      return res.end(
        `User-agent: *\nDisallow: /private\nSitemap: ${base}/index.xml`,
      );
    }
    if (req.url === "/index.xml")
      return xml(
        `<sitemapindex><sitemap><loc>${base}/pages.xml</loc></sitemap></sitemapindex>`,
      );
    if (req.url === "/pages.xml")
      return xml(
        `<urlset>${["/", "/old", "/private", "/broken"].map((u) => `<url><loc>${base + u}</loc></url>`).join("")}</urlset>`,
      );
    if (req.url === "/old") {
      res.writeHead(301, { location: "/article" });
      return res.end();
    }
    if (req.url === "/broken") {
      res.statusCode = 404;
      return res.end("<title>Missing</title>");
    }
    res.end(
      `<title>${req.url}</title><main><h1>Title</h1><a href="/article">Article</a><a href="/deep">Deep</a><a href="/logout">Logout</a><a href="/x?token=secret">Secret</a></main>`,
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`,
      site = { id: "live", label: "Live", baseUrl: base },
      project = {
        id: "fixture",
        name: "Fixture",
        sites: [site],
        pages: [{ id: "home", path: "/" }],
        devices: { desktop: { width: 900, height: 700 } },
      },
      opts = inventoryOptions(["--depth", "1", "--captures", "none"]);
    const result = await crawl(
      site,
      project,
      opts,
      network(base, { interval: 0 }),
    );
    assert.equal(result.coverage.uniqueSitemapUrls, 4);
    assert.equal(result.rows.length, 6);
    assert.equal(result.coverage.complete, true);
    assert.ok(!visited.includes("/private"));
    assert.ok(!visited.includes("/logout"));
    assert.ok(!visited.some((u) => u.includes("token")));
    const old = result.rows.find((r) => r.url === base + "/old");
    assert.equal(old.chain.length, 2);
    assert.equal(old.finalUrl, base + "/article");
    assert.ok(old.decodedBytes > 0);
    assert.equal(
      result.rows.find((r) => r.url === base + "/broken").status,
      404,
    );
    const h = reconcile(
      result.rows,
      { source: "historical", urls: ["/", "/gone"] },
      base,
    );
    assert.equal(h.shared, 1);
    assert.deepEqual(h.absent, [base + "/gone"]);
    assert.equal(
      captureSelection(result.rows, project, site, "all", 24).length,
      4,
    );
    assert.equal(
      captureSelection(result.rows, project, site, "representative", 24).length,
      2,
    );
    const historical = await crawl(
      site,
      project,
      { ...opts, depth: 0 },
      network(base, { interval: 0 }),
      async () => {},
      { urls: ["/orphan"] },
    );
    assert.ok(
      historical.rows
        .find((r) => r.url === base + "/orphan")
        .sources.includes("historical reference"),
    );
    const limited = await crawl(
      site,
      project,
      { ...opts, "max-urls": 2 },
      network(base, { interval: 0 }),
    );
    assert.equal(limited.coverage.complete, false);
    assert.ok(limited.coverage.limits.length);
    const html = inventoryReport({
      project,
      site,
      options: opts,
      ...result,
      startedAt: "now",
      state: "complete",
      captureCoverage: {
        selectedPages: 0,
        eligiblePages: 4,
        devices: ["desktop"],
      },
    });
    assert.ok(html.includes("6 URLs collected"));
    assert.ok(
      html.includes("asset versions") || html.includes("Asset versions"),
    );
    assert.ok(!html.includes("token=secret"));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("inventory browser captures both devices, records provenance, blocks writes and reports HTTP failures", async () => {
  const { chromium } = await import("playwright"),
    { mkdtemp, mkdir, readFile, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path"),
    { captureInventoryPage } = await import("../scripts/inventory/capture.mjs"),
    { hash } = await import("../scripts/inventory/core.mjs");
  const methods = [];
  const server = createServer((req, res) => {
    methods.push(req.method);
    res.setHeader("Content-Type", "text/html");
    if (req.url === "/broken") {
      res.statusCode = 500;
      return res.end("Failure");
    }
    res.end(
      '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture</title><main><h1>Fixture page</h1><div style="height:1200px">Below fold</div></main><script>fetch("/write",{method:"POST",body:"test"}).catch(()=>{});</script>',
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`,
    dir = await mkdtemp(join(tmpdir(), "inventory-")),
    browser = await chromium.launch();
  await mkdir(join(dir, "captures"));
  try {
    for (const [device, viewport] of Object.entries({
      desktop: { width: 900, height: 700 },
      mobile: { width: 390, height: 844 },
    })) {
      const c = await captureInventoryPage(
        browser,
        { url: base },
        device,
        viewport,
        { dir },
        base,
        `captures/${device}.png`,
      );
      assert.equal(c.status, "ok", c.error);
      assert.equal(c.width, viewport.width);
      assert.ok(c.height > 1200);
      assert.equal(hash(await readFile(join(dir, c.file))), c.sha256);
    }
    const bad = await captureInventoryPage(
      browser,
      { url: base + "/broken" },
      "desktop",
      { width: 900, height: 700 },
      { dir },
      base,
      "captures/broken.png",
    );
    assert.equal(bad.status, "error");
    assert.match(bad.error, /HTTP 500/);
    assert.ok(methods.every((m) => m === "GET"));
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});

test("competitors use explicit project configuration and reject credentials or colliding site ids", () => {
  const project = {
    sites: [{ id: "live", baseUrl: "https://client.example" }],
    pages: [],
    devices: { desktop: { width: 900, height: 700 } },
    inventory: {
      competitors: [
        {
          id: "competitor",
          label: "Competitor",
          baseUrl: "https://competitor.example",
          seeds: ["/about"],
        },
      ],
    },
  };
  assert.equal(
    selectSite(project, { site: "competitor" }).baseUrl,
    "https://competitor.example",
  );
  assert.throws(() =>
    selectSite(
      {
        ...project,
        inventory: {
          competitors: [
            {
              id: "live",
              label: "Duplicate",
              baseUrl: "https://competitor.example",
            },
          ],
        },
      },
      { site: "live" },
    ),
  );
  assert.throws(() =>
    selectSite(
      {
        ...project,
        inventory: {
          competitors: [
            {
              id: "bad",
              label: "Bad",
              baseUrl: "https://user:pass@example.com",
            },
          ],
        },
      },
      { site: "bad" },
    ),
  );
});
