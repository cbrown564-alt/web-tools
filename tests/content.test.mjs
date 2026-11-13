import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  newPlan,
  compileMap,
  validatePlan,
  importCsv,
  toCsv,
  parseCsv,
  validWebUrl,
} from "../src/content/model.js";
import { checkRule, validateMap } from "../scripts/content/check.mjs";
import { reviewPage } from "../scripts/content/page.mjs";
const manifest = {
  project: { id: "fixture", name: "Fixture" },
  site: { id: "live", baseUrl: "https://example.com" },
  inventorySha256: "a".repeat(64),
  inventoryState: "complete",
  pages: ["/keep", "/rewrite", "/old", "/gone"].map((path) => ({
    url: "https://example.com" + path,
  })),
};
test("decisions are explicit, inventory-bound and compile to exact rules with draft coverage", () => {
  const p = newPlan(manifest);
  assert.ok(p.rows.every((r) => r.decision === "undecided"));
  assert.equal(compileMap(p, manifest).complete, false);
  for (const [i, d] of ["keep", "rewrite", "consolidate", "remove"].entries())
    p.rows[i].decision = d;
  p.rows[2].destination = "/keep";
  const map = compileMap(p, manifest);
  assert.equal(map.complete, true);
  assert.deepEqual(
    map.rules.map((r) => r.status),
    [200, 200, 301, 410],
  );
  validateMap(map);
  assert.equal(
    compileMap(p, { ...manifest, inventoryState: "partial" }).complete,
    false,
  );
  assert.throws(() => validatePlan({ ...p, projectId: "foreign" }, manifest));
  assert.throws(() =>
    validatePlan(
      { ...p, rows: [p.rows[0], p.rows[0], ...p.rows.slice(2)] },
      manifest,
    ),
  );
  p.rows[2].destination = "/old";
  assert.throws(() => compileMap(p, manifest), /itself/);
  p.rows[2].destination = "/gone";
  assert.throws(() => compileMap(p, manifest), /marked remove/);
  p.rows[0].decision = "consolidate";
  p.rows[0].destination = "/old";
  p.rows[2].destination = "/rewrite";
  assert.throws(() => compileMap(p, manifest), /another redirect/);
  for (const u of [
    "javascript:alert(1)",
    "https://user:pass@example.com",
    "//evil.example/x",
    "relative/path",
    "/x#fragment",
    "/x?token=secret",
  ])
    assert.throws(() => validWebUrl(u, manifest.site.baseUrl), u);
});
test("CSV safely round-trips formulas, quotes, newlines and partial merges; malformed imports are atomic", () => {
  const p = newPlan(manifest);
  p.rows[0].decision = "rewrite";
  p.rows[0].notes = '=SUM(A1)\n"Quotes", commas and café';
  p.rows[1].notes = "'literal";
  const csv = toCsv(p);
  assert.ok(csv.includes("'=SUM"));
  assert.deepEqual(importCsv(csv, newPlan(manifest), manifest).rows, p.rows);
  const lines = parseCsv(csv),
    one = [lines[0], lines[1]]
      .map((r) => r.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","))
      .join("\r\n");
  const merged = importCsv(one, newPlan(manifest), manifest);
  assert.equal(merged.rows[0].decision, "rewrite");
  assert.equal(merged.rows[1].decision, "undecided");
  assert.throws(() =>
    importCsv(
      csv.replace("example.com/keep", "evil.example/keep"),
      p,
      manifest,
    ),
  );
  assert.equal(p.rows[0].decision, "rewrite");
  assert.throws(() => parseCsv('"unclosed'));
  assert.throws(
    () => validateMap({ ...compileMap(p, manifest), complete: true }),
    /coverage/,
  );
});
test("standalone review escapes inline JSON without changing source text", () => {
  const html = reviewPage(
    {
      ...manifest,
      project: { id: "fixture", name: "A </script><script>alert(1)</script>" },
    },
    "",
  );
  const json = html.match(
    /<script id="manifest" type="application\/json">([\s\S]*?)<\/script>/,
  )[1];
  assert.equal(
    JSON.parse(json).project.name,
    "A </script><script>alert(1)</script>",
  );
  assert.ok(!json.includes("</script>"));
});
test("redirect checker proves exact statuses and destinations; rejects wrong targets, loops, chains and unavailable pages", async () => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.method);
    const redirects = {
      "/old": [301, "/keep"],
      "/wrong": [301, "/other"],
      "/chain": [301, "/old"],
      "/loop": [301, "/loop"],
      "/bad": [301, "/missing"],
      "/temp": [302, "/keep"],
      "/external": [301, "https://unexpected.example/"],
    };
    if (redirects[req.url]) {
      res.writeHead(redirects[req.url][0], { location: redirects[req.url][1] });
      return res.end();
    }
    res.statusCode =
      req.url === "/gone" ? 410 : req.url === "/missing" ? 404 : 200;
    res.end("Fixture");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const rule = (
      path,
      status = 301,
      destination = "https://example.com/keep",
    ) => ({ source: "https://example.com" + path, status, destination });
    assert.equal((await checkRule(rule("/old"), { base })).status, "pass");
    assert.equal(
      (await checkRule(rule("/keep", 200, null), { base })).status,
      "pass",
    );
    assert.equal(
      (await checkRule(rule("/gone", 410, null), { base })).status,
      "pass",
    );
    for (const p of ["/wrong", "/chain", "/loop", "/bad", "/temp", "/external"])
      assert.equal((await checkRule(rule(p), { base })).status, "fail", p);
    const unavailable = await checkRule(
      rule("/bad", 301, "https://example.com/missing"),
      { base },
    );
    assert.equal(unavailable.status, "fail");
    assert.match(unavailable.error, /Destination returned HTTP 404/);
    assert.ok(requests.every((m) => m === "GET"));
  } finally {
    await new Promise((r) => server.close(r));
  }
});
