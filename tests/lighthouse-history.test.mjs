import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  aggregatePerformance,
  performanceSummary,
} from "../scripts/site-check/core.mjs";

const archive = JSON.parse(
  await readFile(
    new URL("./fixtures/lighthouse-2026-11-08.json", import.meta.url),
    "utf8",
  ),
);
test("current summaries reproduce all 54 archived Lighthouse audits and 18 independent reference groups", () => {
  assert.equal(archive.samples.length, 54);
  const actual = aggregatePerformance(
    archive.samples.map((s) => ({
      status: "ok",
      target: { page: s.page, side: s.side, device: "mobile" },
      result: performanceSummary(s.lhr),
    })),
  );
  assert.equal(actual.length, 18);
  for (const expected of archive.expected) {
    const group = actual.find(
      (g) =>
        g.target.page === expected.name && g.target.side === expected.target,
    );
    assert.ok(group, `Missing ${expected.name}/${expected.target}`);
    const pairs = [
      ["score", group.performance, expected.score],
      ...Object.entries(group.metrics).map(([name, value]) => [
        name,
        value,
        expected.metrics[name],
      ]),
    ];
    for (const [name, observed, reference] of pairs)
      for (const k of ["n", "median", "min", "max"]) {
        assert.ok(
          Math.abs(observed[k] - reference[k]) < 1e-6,
          `${expected.name}/${expected.target}/${name}/${k}: ${observed[k]} vs ${reference[k]}`,
        );
      }
  }
});
