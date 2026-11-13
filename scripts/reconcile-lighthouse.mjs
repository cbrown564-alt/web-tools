// Offline reconciliation of the archived London Potters benchmark. Never re-measures a site.
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import assert from "node:assert/strict";
import {
  aggregatePerformance,
  performanceSummary,
  stats,
  redact,
} from "./site-check/core.mjs";
const { values } = parseArgs({
  options: {
    historical: { type: "string" },
    current: { type: "string" },
    output: { type: "string" },
  },
});
for (const name of ["historical", "current", "output"])
  if (!values[name]) throw new Error(`--${name} is required`);
const historical = resolve(values.historical),
  current = resolve(values.current),
  output = resolve(values.output);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = async (file) => {
  const bytes = await readFile(file);
  return {
    file,
    sha256: sha(bytes),
    value: JSON.parse(
      file.endsWith(".gz") ? gunzipSync(bytes) : bytes.toString("utf8"),
    ),
  };
};
const oldSummary = await read(resolve(historical, "summary.json")),
  oldConditions = await read(resolve(historical, "conditions.json"));
const currentResults = await read(resolve(current, "results.json")),
  currentConditions = await read(resolve(current, "conditions.json"));
const archived = [];
for (const file of (await readdir(resolve(historical, "raw"))).sort()) {
  const m = file.match(
    /^lh-(.+)-(wordpress|cloudflare|production)-([123])\.json\.gz$/,
  );
  if (!m) continue;
  const source = await read(resolve(historical, "raw", file)),
    lhr = source.value;
  archived.push({
    target: { page: m[1], side: m[2], device: "mobile", url: lhr.requestedUrl },
    status: "ok",
    result: performanceSummary(lhr),
    source,
    lhr,
  });
}
assert.equal(
  archived.length,
  54,
  "Expected the complete archived 54-audit series",
);
const replay = aggregatePerformance(archived);
let assertions = 0;
for (const expected of oldSummary.value.lighthouse) {
  const actual = replay.find(
    (g) => g.target.page === expected.name && g.target.side === expected.target,
  );
  assert.ok(
    actual,
    `Missing archived group ${expected.name}/${expected.target}`,
  );
  const pairs = [
    [actual.performance, expected.score],
    ...Object.entries(actual.metrics).map(([k, v]) => [v, expected.metrics[k]]),
  ];
  for (const [a, b] of pairs)
    for (const k of ["n", "median", "min", "max"]) {
      assert.ok(
        Math.abs(a[k] - b[k]) < 1e-6,
        `Archived aggregation mismatch ${expected.name}/${expected.target}/${k}`,
      );
      assertions++;
    }
}
const identity = (lhr) => {
  const lcpNodes = (lhr.audits["lcp-breakdown-insight"]?.details?.items || [])
    .filter((n) => n.type === "node")
    .map(({ nodeLabel, selector, boundingRect, snippet }) => ({
      nodeLabel,
      selector,
      boundingRect,
      snippet,
    }));
  const imageRequests = (
    lhr.audits["network-requests"]?.details?.items || []
  ).filter((r) => r.resourceType === "Image");
  const candidates = [];
  for (const node of lcpNodes) {
    const source = node.snippet?.match(/(?:^|\s)src="([^"]+)"/)?.[1];
    if (!source) continue;
    try {
      const prefix = new URL(
        source.split(/…|%E2%80%A6/i)[0],
        lhr.finalDisplayedUrl || lhr.requestedUrl,
      ).href;
      candidates.push(
        ...imageRequests
          .filter((r) => r.url.startsWith(prefix))
          .map(({ url, resourceSize, transferSize, mimeType }) => ({
            url,
            resourceSize,
            transferSize,
            mimeType,
          })),
      );
    } catch {
      /* A truncated snippet may not contain a valid URL. */
    }
  }
  return {
    version: lhr.lighthouseVersion,
    browser: lhr.environment?.hostUserAgent,
    settings: Object.fromEntries(
      [
        "formFactor",
        "screenEmulation",
        "throttlingMethod",
        "throttling",
        "maxWaitForLoad",
        "disableStorageReset",
      ].map((k) => [k, lhr.configSettings?.[k]]),
    ),
    lcpNodes,
    domElements:
      lhr.audits["dom-size-insight"]?.details?.items?.find(
        (r) => r.statistic === "Total elements",
      )?.value?.value ?? null,
    lcpImageCandidates: candidates,
    imageMatchMethod:
      "Prefix match from the LCP image src in the saved DOM snippet. A single candidate identifies the request; multiple candidates remain ambiguous.",
    requests: lhr.audits["network-requests"]?.details?.items?.length,
    warnings: lhr.runWarnings || [],
  };
};

const comparisons = [];
for (const group of aggregatePerformance(
  currentResults.value.results.performance,
).filter((g) => g.target.device === "mobile")) {
  const older = archived.filter((r) => r.target.url === group.target.url);
  if (!older.length) continue;
  const newer = [];
  for (const row of currentResults.value.results.performance.filter(
    (r) =>
      r.status === "ok" &&
      r.target.url === group.target.url &&
      r.target.device === "mobile",
  ))
    newer.push(await read(resolve(current, row.raw)));
  const before = aggregatePerformance(older)[0];
  const previous = older.map((r) => identity(r.lhr)),
    present = newer.map((r) => identity(r.value));
  const unique = (values) =>
    [...new Set(values.map((v) => JSON.stringify(v)))].map((v) =>
      JSON.parse(v),
    );
  comparisons.push({
    target: group.target,
    historical: {
      score: before.performance,
      metrics: before.metrics,
      observations: previous,
    },
    current: {
      score: group.performance,
      metrics: group.metrics,
      observations: present,
    },
    changes: {
      lcpLabels: {
        historical: unique(
          previous.flatMap((x) => x.lcpNodes.map((n) => n.nodeLabel)),
        ),
        current: unique(
          present.flatMap((x) => x.lcpNodes.map((n) => n.nodeLabel)),
        ),
      },
      domElements: {
        historical: stats(previous.map((x) => x.domElements)),
        current: stats(present.map((x) => x.domElements)),
      },
      requestCounts: {
        historical: stats(previous.map((x) => x.requests)),
        current: stats(present.map((x) => x.requests)),
      },
    },
    sources: {
      historical: older.map((r) => ({
        file: r.source.file,
        sha256: r.source.sha256,
      })),
      current: newer.map((r) => ({ file: r.file, sha256: r.sha256 })),
    },
  });
}
assert.equal(
  comparisons.length,
  4,
  "Expected gallery/events on production and EmDash",
);
const result = {
  version: 1,
  generatedAt: new Date().toISOString(),
  producer: {
    file: "scripts/reconcile-lighthouse.mjs",
    sha256: sha(await readFile(new URL(import.meta.url))),
  },
  method:
    "Offline replay of 54 complete archived Lighthouse audits through the current summariser, checked against the independently calculated archived summary. URL-matched mobile comparisons retain per-run LCP identities, geometry, image markup and request counts. No fresh measurements or causal attribution.",
  replay: {
    audits: archived.length,
    groups: replay.length,
    assertions,
    passed: true,
  },
  sourceSummaries: [
    oldSummary,
    currentResults,
    oldConditions,
    currentConditions,
  ].map(({ file, sha256 }) => ({ file, sha256 })),
  historicalConditions: oldConditions.value,
  currentConditions: currentConditions.value,
  comparisons,
};
await mkdir(output); // An existing reconciliation folder must not be overwritten.
await writeFile(
  resolve(output, "reconciliation.json"),
  JSON.stringify(redact(result), null, 2) + "\n",
);
console.log(
  JSON.stringify({
    output,
    archivedAudits: archived.length,
    groups: replay.length,
    assertions,
    comparisons: comparisons.length,
    passed: true,
  }),
);
