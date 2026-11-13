// Synthetic saved results for every report type. They deliberately contain
// run names, hashes, rule ids and ISO timestamps so the tests can show that
// none of them reaches the first screen.
const sha = "9c4d16ffd905ef1f41017b91b3d29c95e5cfc513aaa2c788fd994838cf7c3e88";
const project = { id: "fixture", name: "Fixture Pottery" };
const target = (page, label, device) => ({
  page,
  label,
  side: "live",
  device,
  url: `https://www.fixture.example/${page === "home" ? "" : page}`,
});
const targets = [
  target("home", "Home", "desktop"),
  target("home", "Home", "mobile"),
  target("gallery", "Gallery", "desktop"),
  target("gallery", "Gallery", "mobile"),
];
const live = {
  ...project,
  labels: { live: "Live website" },
  sites: [{ id: "live", baseUrl: "https://www.fixture.example/" }],
};
const violation = (id, impact, n) => ({
  id,
  impact,
  description: id,
  help: id,
  helpUrl: "https://example.com/" + id,
  nodes: Array.from({ length: n }, () => ({})),
});

export const siteCheck = {
  version: 1,
  project: live,
  options: {
    tier: "minimal",
    modules: ["performance", "accessibility", "security", "discovery"],
  },
  startedAt: "2026-11-12T16:02:10.951Z",
  finishedAt: "2026-11-12T16:04:10.951Z",
  durationMs: 120000,
  state: "complete",
  preflight: targets.map((t) => ({ target: t, status: "ok" })),
  results: {
    performance: targets.map((t, i) => ({
      target: t,
      status: "ok",
      raw: `raw/performance-${i}.json`,
      result: {
        scores: { performance: i % 2 ? 41 : 93 },
        metrics: {
          "largest-contentful-paint": 2100,
          "total-blocking-time": 120,
          "cumulative-layout-shift": 0.01,
        },
      },
    })),
    accessibility: targets.map((t, i) => ({
      target: t,
      status: "ok",
      raw: `raw/accessibility-${i}.json`,
      result: {
        violations: [
          violation("color-contrast", "serious", 6),
          ...(i > 1 ? [violation("aria-allowed-attr", "critical", 1)] : []),
        ],
        incomplete: [],
      },
    })),
    security: targets.map((t) => ({
      target: t,
      status: "ok",
      result: {
        headers: {},
        chain: [],
        redirect: { https: true },
        missingHeaders: ["strict-transport-security", "referrer-policy"],
      },
    })),
    discovery: targets.map((t) => ({
      target: t,
      status: "ok",
      result: {
        httpStatus: 200,
        title: t.label,
        canonicals: [],
        indexing: t.page === "gallery" ? ["noindex"] : [],
      },
    })),
  },
  sites: {
    live: {
      security: {
        tls: { status: "ok", protocol: "TLSv1.3" },
        email: {
          domain: "fixture.example",
          method: "DNS",
          mx: { status: "ok" },
          spf: { status: "ok", records: [] },
          dmarc: { status: "absent" },
          dkim: { status: "not tested", reason: "Selector unknown" },
        },
      },
    },
  },
};

const row = (t, i, extra = {}) => ({
  target: t,
  status: "ok",
  assertions: [
    { id: "hero-visible", type: "visible", status: "pass" },
    { id: "survey-script", type: "script", status: "pass" },
  ],
  capture: { file: `captures/${i}.png`, sha256: sha },
  baselineFile: `baseline/${i}.png`,
  diff: { changedRatio: 0, dimensionsChanged: false, changed: false },
  ...extra,
});
const watchBase = {
  version: 1,
  tool: "watch",
  project,
  site: "live",
  startedAt: "2026-11-13T09:15:00.000Z",
  finishedAt: "2026-11-13T09:17:00.000Z",
  policy: {
    sha256: sha,
    masks: [".carousel"],
    pixelThreshold: 0.1,
    maxChangedRatio: 0.001,
    siteCheck: true,
  },
  baseline: {
    run: "2026-11-12-watch-01",
    site: "live",
    policySha256: sha,
    resultsSha256: sha,
    acceptedAt: "2026-11-12T17:12:32.830Z",
  },
};
const checkFindings = [
  "accessibility/live/home/desktop: color-contrast (6 elements)",
  "security/live/home/desktop: missing strict-transport-security",
];
export const watchQuiet = {
  ...watchBase,
  run: "2026-11-13-watch-01",
  state: "quiet",
  rows: targets.map((t, i) =>
    row(
      t,
      i,
      i === 3
        ? {
            diff: {
              changedRatio: 0.00004,
              dimensionsChanged: false,
              changed: false,
              file: "diff/3.png",
            },
          }
        : {},
    ),
  ),
  siteCheck: {
    state: "complete",
    report: "site-check/report.html",
    run: "2026-11-13-watch-01-check",
    findings: checkFindings,
  },
  siteCheckChanges: [],
};
export const watchChanged = {
  ...watchBase,
  run: "2026-11-13-watch-02",
  state: "failed",
  rows: targets.map((t, i) =>
    row(
      t,
      i,
      i === 0
        ? {
            diff: {
              changedRatio: 0.08,
              dimensionsChanged: true,
              changed: true,
              file: "diff/0.png",
            },
          }
        : i === 2
          ? {
              assertions: [
                {
                  id: "survey-script",
                  type: "script",
                  status: "fail",
                  reason: "No script matching survey.js",
                },
              ],
            }
          : {},
    ),
  ),
  siteCheck: {
    state: "complete",
    report: "site-check/report.html",
    run: "2026-11-13-watch-02-check",
    findings: checkFindings,
  },
  siteCheckChanges: [
    "New: accessibility/live/gallery/mobile: image-alt (2 elements)",
    "Resolved: security/live/home/desktop: missing referrer-policy",
  ],
};

export const inventory = {
  version: 1,
  tool: "inventory",
  project,
  site: {
    id: "live",
    label: "Live website",
    baseUrl: "https://www.fixture.example/",
  },
  run: "2026-11-13-inventory-01",
  startedAt: "2026-11-13T10:00:00.000Z",
  finishedAt: "2026-11-13T10:05:00.000Z",
  state: "partial",
  options: {
    depth: "2",
    "max-urls": "2000",
    "max-sitemaps": "40",
    captures: "representative",
  },
  coverage: {
    complete: false,
    uniqueSitemapUrls: 3,
    documents: [],
    exclusions: {},
    limits: ["Stopped at 2000 URLs"],
    errors: [],
  },
  captureCoverage: { selectedPages: 1, eligiblePages: 2, devices: ["desktop"] },
  rows: [
    {
      url: "https://www.fixture.example/",
      title: "Home",
      status: 200,
      collection: "ok",
      chain: [{}],
      template: { group: "home", basis: "body class" },
      decodedBytes: 1000,
      captures: [
        {
          device: "desktop",
          status: "ok",
          file: "captures/0001-desktop.png",
          sha256: sha,
        },
      ],
      probe: { forms: [] },
    },
    {
      url: "https://www.fixture.example/old-shop",
      title: "",
      status: 404,
      collection: "ok",
      chain: [{}],
      captures: [],
      probe: { forms: [] },
    },
    {
      url: "https://www.fixture.example/news",
      title: "News",
      status: 200,
      collection: "ok",
      chain: [{}, {}],
      finalUrl: "https://www.fixture.example/blog",
      template: { group: "archive", basis: "body class" },
      decodedBytes: 2000,
      captures: [],
      probe: { forms: [] },
    },
  ],
};

export const releasePack = {
  version: 1,
  tool: "release-kit",
  action: "pack",
  project,
  run: "2026-11-13-release-pack-01",
  startedAt: "2026-11-13T11:00:00.000Z",
  finishedAt: "2026-11-13T11:00:05.000Z",
  state: "packaged",
  packageSha256: sha,
  package: {
    projectId: "fixture",
    entries: [
      {
        path: "wp-content/themes/fixture/style.css",
        operation: "write",
        bytes: 10,
        sha256: sha,
      },
    ],
  },
};
export const releaseForms = {
  version: 1,
  tool: "release-kit",
  action: "forms",
  project,
  run: "2026-11-13-release-forms-01",
  startedAt: "2026-11-13T11:10:00.000Z",
  finishedAt: "2026-11-13T11:11:00.000Z",
  state: "failed",
  forms: {
    scope: "Synthetic contact form fixture.",
    state: "failed",
    cleanupVerified: true,
    unrelatedRecordPreserved: true,
    rows: [
      {
        device: "desktop",
        mode: "delivery",
        state: "passed",
        receiptVerified: true,
        cleanupVerified: true,
        marker: "wt-" + sha.slice(0, 16),
      },
      {
        device: "mobile",
        mode: "delivery",
        state: "failed",
        error: "No receipt within 10 seconds",
        marker: "wt-" + sha.slice(16, 32),
      },
    ],
  },
};

export const redirectCheck = {
  version: 1,
  tool: "redirect-check",
  project,
  run: "2026-11-13-redirect-check-01",
  startedAt: "2026-11-13T12:00:00.000Z",
  finishedAt: "2026-11-13T12:00:10.000Z",
  state: "failed",
  base: "https://staging.fixture.example",
  coverage: { decided: 2, total: 3 },
  mapComplete: false,
  rows: [
    {
      source: "https://www.fixture.example/about",
      expectedStatus: 200,
      expectedDestination: "",
      status: "pass",
      chain: [{ url: "https://staging.fixture.example/about", status: 200 }],
    },
    {
      source: "https://www.fixture.example/old-shop",
      expectedStatus: 301,
      expectedDestination: "/shop",
      status: "fail",
      error: "Final response was 404",
      chain: [{ url: "https://staging.fixture.example/old-shop", status: 404 }],
    },
  ],
};

export const maximum = {
  version: 1,
  tool: "site-check-maximum",
  project: live,
  run: "2026-11-13-maximum-01",
  startedAt: "2026-11-13T13:00:00.000Z",
  finishedAt: "2026-11-13T13:20:00.000Z",
  state: "partial",
  profile: {
    question: "Why is the gallery slow to become usable?",
    crawl: { depth: 1, maxUrls: 50, maxSitemaps: 2 },
    experiments: [],
  },
  observations: [],
  experiments: [],
  crawls: [],
  evidenceMap: [{ file: "results.json", kind: "results", sha256: sha }],
  findings: [
    {
      number: 1,
      label: "confirmed",
      title: "The gallery loads forty full-size images before it can be used",
      detail: "Every journey waited for all forty images.",
      evidence: ["journey-1.json"],
    },
    {
      number: 2,
      label: "unresolved",
      title: "No causal experiment configured",
      detail: "Observations alone cannot identify a cause.",
      evidence: [],
    },
  ],
};
