import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { wording, describe } from "../scripts/report/wording.mjs";
import { findingType } from "../scripts/report/findings.mjs";

const require = createRequire(import.meta.url);

test("every finding a report can emit has plain wording", async () => {
  const source = await readFile("scripts/report/findings.mjs", "utf8");
  // Fixed types: every string literal handed to add(), on the same or next line.
  const fixed = [...source.matchAll(/["`]([a-z-]+:[a-z-]+)["`]/g)].map(
    (m) => m[1],
  );
  assert.ok(fixed.length > 30, "expected to find the emitted types");
  for (const type of fixed)
    assert.ok(wording[type], `wording.mjs has no entry for ${type}`);
  // Built types: each prefix that findings.mjs completes from collected data.
  const prefixes = [...source.matchAll(/`([a-z-]+:[a-z-]*)\$\{/g)].map(
    (m) => m[1],
  );
  assert.deepEqual([...new Set(prefixes)].sort(), [
    "axe:",
    "header:",
    "watch:assertion-",
  ]);
  const built = [
    ...require("axe-core")
      .getRules()
      .map((r) => `axe:${r.ruleId}`),
    ...[
      "strict-transport-security",
      "content-security-policy",
      "x-content-type-options",
      "referrer-policy",
    ].map((h) => `header:${h}`),
    ...["visible", "script", "listing", "style", "attribute"].map(
      (t) => `watch:assertion-${t}`,
    ),
  ];
  for (const type of built)
    assert.ok(describe(type).known, `no wording covers ${type}`);
});

test("the collectors' own lists match the ones the wording test assumes", async () => {
  const check = await readFile("scripts/site-check.mjs", "utf8");
  const headers = /missingHeaders: \[([^\]]+)\]/.exec(check)[1];
  assert.deepEqual(
    [...headers.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
    [
      "strict-transport-security",
      "content-security-policy",
      "x-content-type-options",
      "referrer-policy",
    ],
  );
  const watch = await readFile("scripts/watch/core.mjs", "utf8");
  assert.deepEqual(
    [
      ...new Set(
        [...watch.matchAll(/a\.type === "([a-z]+)"/g)].map((m) => m[1]),
      ),
    ].sort(),
    ["attribute", "listing", "script", "style", "visible"],
  );
});

test("each entry states a finding and why it matters, with no jargon ids", () => {
  for (const [type, entry] of Object.entries(wording)) {
    assert.ok(entry.say && entry.why, `${type} needs say and why`);
    assert.ok(entry.rank >= 1 && entry.rank <= 5, `${type} rank`);
    assert.ok(
      !/[.!]$/.test(entry.say),
      `${type}: say is a clause, no full stop`,
    );
    for (const text of [entry.say, entry.why, entry.decide || ""])
      assert.ok(
        !/\b(WCAG|axe|aria|canonical|noindex|HSTS|CSP|TTFB|LCP|CLS|viewport|SHA)\b/i.test(
          text,
        ),
        `${type} uses jargon: ${text}`,
      );
  }
});

test("an unknown type still reads sensibly and is marked unknown", () => {
  const d = describe("module:something-new");
  assert.equal(d.known, false);
  assert.match(d.say, /something-new/);
});

test("stored watch findings map back to wording without changing their form", () => {
  const cases = {
    "accessibility/live/gallery/desktop: color-contrast (6 elements)":
      "axe:color-contrast",
    "security/live/home/mobile: missing referrer-policy":
      "header:referrer-policy",
    "security/live/home/mobile: HTTP redirect is not HTTPS":
      "redirect:not-https",
    "discovery/live/home/mobile: missing title": "discovery:title-missing",
    "discovery/live/home/mobile: 0 canonicals": "discovery:canonical-missing",
    "discovery/live/home/mobile: 2 canonicals": "discovery:canonical-multiple",
    "discovery/live/home/mobile: HTTP 404": "discovery:http-status",
    "performance/live/home/mobile: error": "collection:error",
  };
  for (const [text, type] of Object.entries(cases)) {
    assert.equal(findingType(text).type, type);
    assert.ok(describe(type).known);
  }
});
