import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  symlink,
  writeFile,
  readFile,
  rm,
  cp,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { newPlan, compileMap } from "../src/content/model.js";
test("CLI exports inspectable check evidence, rejects partial maps by default and detects injected failures", async () => {
  const root = process.cwd(),
    dir = await mkdtemp(join(tmpdir(), "content-cli-"));
  for (const file of [
    "scripts",
    "src",
    "package.json",
    "package-lock.json",
    "node_modules",
  ])
    await symlink(resolve(root, file), join(dir, file));
  await mkdir(join(dir, "projects/fixture"), { recursive: true });
  await writeFile(
    join(dir, "projects/fixture/project.json"),
    JSON.stringify({
      version: 2,
      kind: "site-check",
      id: "fixture",
      name: "Synthetic redirect workflow fixture",
      site: { id: "live", label: "Fixture", baseUrl: "https://example.com" },
      pages: [{ id: "home", label: "Home", path: "/" }],
      devices: { desktop: { width: 900, height: 700 } },
    }),
  );
  const server = createServer((req, res) => {
    const routes = {
      "/old": "/keep",
      "/wrong": "/other",
      "/loop": "/loop",
      "/chain": "/old",
      "/bad": "/missing",
    };
    if (routes[req.url]) {
      res.writeHead(301, { location: routes[req.url] });
      return res.end();
    }
    res.statusCode =
      req.url === "/gone" ? 410 : req.url === "/missing" ? 404 : 200;
    res.end("Fixture");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function run(args) {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [join(root, "scripts/content.mjs"), ...args],
        { cwd: dir, env: { ...process.env, PROJECT: "fixture" } },
      );
      let output = "";
      child.stdout.on("data", (x) => (output += x));
      child.stderr.on("data", (x) => (output += x));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, output }));
    });
  }
  try {
    const manifest = {
        project: { id: "fixture" },
        site: { id: "live", baseUrl: "https://example.com" },
        inventorySha256: "f".repeat(64),
        inventoryState: "complete",
        pages: ["keep", "old", "gone"].map((s) => ({
          url: "https://example.com/" + s,
        })),
      },
      plan = newPlan(manifest);
    plan.rows[0].decision = "keep";
    plan.rows[1].decision = "consolidate";
    plan.rows[1].destination = "/keep";
    plan.rows[2].decision = "remove";
    const map = compileMap(plan, manifest);
    await writeFile(join(dir, "good.json"), JSON.stringify(map));
    let result = await run([
      "check",
      "--map",
      "good.json",
      "--base",
      base,
      "--run",
      "good",
    ]);
    assert.equal(result.code, 0, result.output);
    let evidence = JSON.parse(
      await readFile(join(dir, "projects/fixture/evidence/good/results.json")),
    );
    assert.equal(evidence.state, "passed");
    assert.equal(evidence.rows.length, 3);
    assert.ok(
      (
        await readFile(
          join(dir, "projects/fixture/evidence/good/report.html"),
          "utf8",
        )
      ).includes("3/3 rules passed"),
    );
    const bad = structuredClone(map);
    for (const path of ["wrong", "loop", "chain", "bad"])
      bad.rules.push({
        source: "https://example.com/" + path,
        decision: "consolidate",
        status: 301,
        destination:
          path === "bad"
            ? "https://example.com/missing"
            : "https://example.com/keep",
        notes: "",
      });
    bad.coverage = {
      total: 7,
      decided: 7,
      undecided: 0,
      inventoryState: "complete",
    };
    await writeFile(join(dir, "bad.json"), JSON.stringify(bad));
    result = await run([
      "check",
      "--map",
      "bad.json",
      "--base",
      base,
      "--run",
      "bad",
    ]);
    assert.equal(result.code, 2, result.output);
    evidence = JSON.parse(
      await readFile(join(dir, "projects/fixture/evidence/bad/results.json")),
    );
    assert.equal(evidence.rows.filter((r) => r.status === "fail").length, 4);
    map.complete = false;
    map.coverage.inventoryState = "partial";
    await writeFile(join(dir, "partial.json"), JSON.stringify(map));
    result = await run([
      "check",
      "--map",
      "partial.json",
      "--base",
      base,
      "--run",
      "refused",
    ]);
    assert.equal(result.code, 1);
    assert.match(result.output, /partial/);
    result = await run([
      "check",
      "--map",
      "partial.json",
      "--base",
      base,
      "--allow-partial",
      "--run",
      "explicit-partial",
    ]);
    assert.equal(result.code, 0, result.output);
    if (process.env.SAVE_CONTENT_FIXTURES) {
      const out = join(root, "output/verification/content/check-fixtures");
      await mkdir(out, { recursive: true });
      await cp(join(dir, "projects/fixture/evidence"), out, {
        recursive: true,
        force: true,
      });
    }
  } finally {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
