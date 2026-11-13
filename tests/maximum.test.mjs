import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { maximumFixture } from "./fixtures/maximum-server.mjs";
import { runMaximum } from "../scripts/site-check/maximum.mjs";
import { options, redact } from "../scripts/site-check/core.mjs";
import {
  validateMaximumProfile,
  layoutParity,
  assessExperiment,
  hash,
} from "../scripts/site-check/maximum-core.mjs";
import { measureJourney } from "../scripts/site-check/maximum-browser.mjs";

test("maximum options and profiles require a bounded question, safe recorded journeys and explicit experiments", async () => {
  const f = await maximumFixture();
  try {
    assert.equal(options(["--tier", "maximum"]).tier, "maximum");
    assert.throws(() => options(["--profile", "x"]), /maximum/);
    assert.throws(
      () => options(["--tier", "maximum", "--modules", "cache"]),
      /profile/,
    );
    assert.deepEqual(validateMaximumProfile(f.profile, f.project), f.profile);
    for (const edit of [
      (p) => (p.projectId = "foreign"),
      (p) => (p.repetitions = 1),
      (p) => (p.crawl.maxUrls = 0),
      (p) => (p.journeys[0].steps[0].page = "unknown"),
      (p) =>
        (p.experiments[0].block[0].url =
          "https://user:password@example.com/a.js"),
      (p) => (p.experiments[0].block[0].type = "document"),
      (p) => p.experiments[0].block.push(p.experiments[0].block[0]),
    ]) {
      const p = structuredClone(f.profile);
      edit(p);
      assert.throws(() => validateMaximumProfile(p, f.project));
    }
  } finally {
    await f.close();
  }
});

test("layout parity checks element identity and counts, geometry, truncation and actual pixels", () => {
  const png = new PNG({ width: 4, height: 4 });
  png.data.fill(255);
  const bytes = PNG.sync.write(png),
    settings = {
      selectors: ["h1"],
      maxGeometryDeltaPx: 1,
      maxPixelChangeRatio: 0,
    };
  const a = {
    height: 100,
    groups: { h1: [{ tag: "H1", textSha256: "one", rect: [0, 0, 40, 20] }] },
  };
  assert.equal(layoutParity(a, a, settings, bytes, bytes).passed, true);
  for (const edit of [
    (b) => b.groups.h1.push(b.groups.h1[0]),
    (b) => (b.groups.h1[0].textSha256 = "changed"),
    (b) => (b.groups.h1[0].rect[2] = 44),
    (b) => (b.truncated = true),
    (b) => (b.height = 120),
  ]) {
    const b = structuredClone(a);
    edit(b);
    assert.equal(layoutParity(a, b, settings, bytes, bytes).passed, false);
  }
  png.data.fill(0);
  assert.equal(
    layoutParity(a, a, settings, bytes, PNG.sync.write(png)).passed,
    false,
  );
});

test("causal findings require all alternating pairs, matched interventions, meaningful effects and parity", () => {
  const e = {
    kind: "ablation",
    block: [{ url: "https://example.com/slow.js", type: "script" }],
    minEffectMs: 100,
    minEffectRatio: 0.1,
  };
  const pair = {
    baseline: {
      state: "complete",
      readyMs: 1000,
      requests: [{ url: e.block[0].url, type: "script", status: 200 }],
    },
    candidate: { state: "complete", readyMs: 300, blocked: e.block },
    parity: { passed: true },
  };
  const pairs = Array.from({ length: 3 }, (_, i) => ({
    ...structuredClone(pair),
    repetition: i + 1,
    order: i % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"],
  }));
  assert.equal(assessExperiment(e, pairs, 3).label, "strongly supported");
  for (const edit of [
    (p) => (p.parity.passed = false),
    (p) => (p.candidate.blocked = []),
    (p) => (p.baseline.requests = []),
    (p) => (p.candidate.readyMs = 950),
    (p) => (p.candidate.state = "partial"),
    (p) => (p.candidate.readyMs = NaN),
    (p) => (p.order = ["candidate", "baseline"]),
  ]) {
    const p = structuredClone(pairs[2]);
    edit(p);
    assert.equal(
      assessExperiment(e, [pairs[0], pairs[1], p], 3).label,
      "unresolved",
    );
  }
  assert.equal(assessExperiment(e, pairs.slice(0, 2), 3).label, "unresolved");
  assert.equal(
    assessExperiment({ ...e, kind: "comparison" }, pairs, 3).label,
    "unresolved",
  );
});

test("maximum complete loop crawls, times a real link journey, isolates delayed requests, retains trace filmstrips and proves read-only boundaries", async () => {
  const f = await maximumFixture(),
    root = await mkdtemp(join(tmpdir(), "maximum-loop-"));
  let browser;
  try {
    await writeFile(join(root, "maximum.json"), JSON.stringify(f.profile));
    const r = await runMaximum(f.project, root, {
      tier: "maximum",
      devices: ["desktop"],
      run: "complete",
    });
    assert.equal(
      r.state,
      "complete",
      JSON.stringify({
        failure: r.failure,
        observations: r.observations.map((o) => ({
          state: o.state,
          error: o.error,
          traceError: o.traceError,
        })),
        experiments: r.experiments.map((e) => ({
          assessment: e.assessment,
          pairs: e.pairs.map((p) => ({
            baseline: p.baseline.error || p.baseline.traceError,
            candidate: p.candidate.error || p.candidate.traceError,
          })),
        })),
      }),
    );
    assert.equal(r.crawls[0].coverage.complete, true);
    assert.equal(r.crawls[0].rows.length, 2);
    assert.ok(
      r.crawls[0].rows.every(
        (r) => r.repeat.state === "complete" && r.repeat.sameBody,
      ),
    );
    assert.equal(
      r.experiments[0].assessment.label,
      "strongly supported",
      JSON.stringify(r.experiments[0].assessment),
    );
    assert.deepEqual(
      r.experiments[0].pairs.map((p) => p.order),
      [
        ["baseline", "candidate"],
        ["candidate", "baseline"],
        ["baseline", "candidate"],
      ],
    );
    assert.equal(f.posts, 0);
    assert.ok(r.observations[0].blocked.some((r) => r.method === "POST"));
    assert.ok(!JSON.stringify(r).includes("exclude-this"));
    for (const a of r.evidenceMap)
      assert.equal(
        hash(await readFile(resolve(root, "evidence/complete", a.file))),
        a.sha256,
      );
    for (const sample of [
      r.observations[0],
      ...r.experiments[0].pairs.flatMap((p) => [p.baseline, p.candidate]),
    ]) {
      assert.ok(sample.traceEvents > 0);
      assert.ok(sample.filmstrip.length > 0);
      const trace = JSON.parse(
        await readFile(resolve(root, "evidence/complete", sample.trace)),
      );
      assert.ok(trace.traceEvents.some((e) => e.name === "Screenshot"));
    }
    await assert.rejects(
      () =>
        runMaximum(f.project, root, {
          tier: "maximum",
          devices: ["desktop"],
          run: "complete",
        }),
      /EEXIST/,
    );
    // The recovery case rejects a wrong destination before clicking, while retaining its trace.
    browser = await chromium.launch();
    const journey = structuredClone(f.profile.journeys[0]);
    journey.steps[1].via = "#wrong";
    const out = {
      dir: join(root, "evidence/complete"),
      profile: f.profile,
      json: async (file, value) =>
        writeFile(
          resolve(root, "evidence/complete", file),
          JSON.stringify(redact(value)),
        ),
    };
    const failed = await measureJourney(
      browser,
      f.project,
      journey,
      "live",
      "desktop",
      out,
      "wrong-link",
    );
    assert.equal(failed.state, "partial");
    assert.match(failed.error, /next page/);
    assert.ok(failed.trace);
    assert.ok(failed.filmstrip.length);
    if (process.env.SAVE_MAXIMUM_FIXTURE) {
      await mkdir("output/maximum", { recursive: true });
      await cp(join(root, "evidence/complete"), "output/maximum/fixture", {
        recursive: true,
        force: true,
      });
    }
  } finally {
    await browser?.close();
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("maximum retains a partial report and stops remaining work after HTTP 503", async () => {
  const f = await maximumFixture({ rateLimit: true }),
    root = await mkdtemp(join(tmpdir(), "maximum-rate-limit-"));
  try {
    await writeFile(join(root, "maximum.json"), JSON.stringify(f.profile));
    const r = await runMaximum(f.project, root, {
      tier: "maximum",
      devices: ["desktop"],
      run: "stopped",
    });
    assert.equal(r.state, "partial");
    assert.match(r.failure, /429\/503/);
    assert.equal(r.observations.length, 0);
    assert.ok(
      r.findings.some((f) => f.title === "Configured experiments not run"),
    );
    assert.ok(r.crawls[0].coverage.errors.some((e) => /503/.test(e)));
    assert.ok(
      (
        await readFile(join(root, "evidence/stopped/report.html"), "utf8")
      ).includes("partial"),
    );
  } finally {
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
});
