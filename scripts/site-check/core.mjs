import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { validateProject } from "../../src/model.js";

export const modules = [
  "performance",
  "cache",
  "accessibility",
  "security",
  "discovery",
];
export function options(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      tier: { type: "string", default: "minimal" },
      modules: { type: "string", default: modules.join(",") },
      pages: { type: "string" },
      devices: { type: "string" },
      sites: { type: "string" },
      run: { type: "string" },
      render: { type: "string" },
      profile: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (!["minimal", "standard", "maximum"].includes(values.tier))
    throw new Error("Tier must be minimal, standard or maximum");
  if (values.profile && values.tier !== "maximum")
    throw Error("--profile requires --tier maximum");
  if (
    values.tier === "maximum" &&
    args.some((a) => a === "--modules" || a.startsWith("--modules="))
  )
    throw Error("Maximum investigations use a profile, not --modules");
  values.modules = [...new Set(values.modules.split(","))];
  if (values.modules.some((m) => !modules.includes(m)))
    throw new Error(`Modules: ${modules.join(",")}`);
  for (const k of ["pages", "devices", "sites"])
    if (values[k]) values[k] = [...new Set(values[k].split(","))];
  if (values.run && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(values.run))
    throw new Error("--run must be a short lowercase name");
  if (values.tier === "maximum") values.modules = [];
  return values;
}
export function validateSiteCheckProject(record) {
  if (record?.version === 1) {
    validateProject(record);
    return {
      ...record,
      sites: ["before", "after"].map((id) => ({
        id,
        label: record.labels[id],
        baseUrl: record[`${id}Base`],
      })),
    };
  }
  const fail = (message) => {
    throw new Error(`Invalid site-check project: ${message}`);
  };
  const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (record?.version !== 2 || record.kind !== "site-check")
    fail("expected a comparison record or version 2 live-site record");
  if (!slug.test(record.id || "") || !record.name?.trim())
    fail("id and name are required");
  if (record.site?.id !== "live" || !record.site.label?.trim())
    fail("site must have id live and a label");
  let base;
  try {
    base = new URL(record.site.baseUrl);
  } catch {
    fail("site.baseUrl must be a URL");
  }
  if (base.protocol !== "https:" || base.username || base.password)
    fail("site.baseUrl must use HTTPS without credentials");
  if (!record.devices || !Object.keys(record.devices).length)
    fail("at least one device is required");
  for (const [name, v] of Object.entries(record.devices))
    if (
      !["desktop", "mobile"].includes(name) ||
      !Number.isInteger(v.width) ||
      !Number.isInteger(v.height) ||
      v.width < 1 ||
      v.height < 1
    )
      fail("devices must use positive integer desktop/mobile viewports");
  const seen = new Set();
  if (!Array.isArray(record.pages) || !record.pages.length)
    fail("at least one page is required");
  for (const p of record.pages) {
    if (!slug.test(p.id || "") || seen.has(p.id) || !p.label?.trim())
      fail("pages need unique ids and labels");
    if (
      typeof p.path !== "string" ||
      !p.path.startsWith("/") ||
      p.path.startsWith("//") ||
      new URL(p.path, base).origin !== base.origin
    )
      fail("page paths must stay on the site");
    seen.add(p.id);
  }
  return {
    ...record,
    sites: [record.site],
    labels: { live: record.site.label },
  };
}
export function targets(project, opts) {
  for (const [key, available] of [
    ["pages", project.pages.map((p) => p.id)],
    ["devices", Object.keys(project.devices)],
  ]) {
    if (opts[key]?.some((v) => !available.includes(v)))
      throw new Error(`Unknown ${key}; choose ${available.join(",")}`);
  }
  const sites =
    project.sites ||
    ["before", "after"].map((id) => ({ id, baseUrl: project[`${id}Base`] }));
  return project.pages
    .filter((p) => !opts.pages || opts.pages.includes(p.id))
    .flatMap((p) =>
      sites.flatMap((site) =>
        Object.entries(project.devices)
          .filter(([device]) => !opts.devices || opts.devices.includes(device))
          .map(([device, viewport]) => ({
            page: p.id,
            label: p.label,
            side: site.id,
            device,
            viewport,
            url: new URL(p[`${site.id}Path`] ?? p.path, site.baseUrl).href,
          })),
      ),
    );
}
export const now = () => new Date().toISOString();
export function rotate(items, repetition) {
  const n = repetition % items.length;
  return [...items.slice(n), ...items.slice(0, n)];
}
export function stats(values) {
  const a = values.filter(Number.isFinite).sort((a, b) => a - b);
  return a.length
    ? {
        n: a.length,
        median:
          (a[Math.floor((a.length - 1) / 2)] +
            a[Math.ceil((a.length - 1) / 2)]) /
          2,
        min: a[0],
        max: a.at(-1),
      }
    : null;
}
export function safeUrl(input) {
  try {
    const u = new URL(input);
    if (!["http:", "https:"].includes(u.protocol)) return "[non-web URL]";
    u.username = "";
    u.password = "";
    u.hash = "";
    for (const k of [...u.searchParams.keys()])
      if (
        /key|token|pass|secret|auth|nonce|signature|credential|email/i.test(k)
      )
        u.searchParams.set(k, "[redacted]");
    return u.href;
  } catch {
    return String(input);
  }
}
export function redact(value, secret = process.env.PAGESPEED_INSIGHTS_API_KEY) {
  if (typeof value === "string") {
    let s = secret ? value.split(secret).join("[redacted]") : value;
    s = s.replace(/https?:\/\/[^\s<>"']+/g, safeUrl);
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, secret));
  if (value && typeof value === "object") {
    if (
      typeof value.name === "string" &&
      /^(authorization|proxy-authorization|cookie|set-cookie)$/i.test(
        value.name,
      )
    )
      return { name: value.name, value: "[redacted]" };
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            !/^(authorization|proxy-authorization|cookie|set-cookie|apiKey|api_key|password|token|secret)$/i.test(
              k,
            ),
        )
        .map(([k, v]) => [k, redact(v, secret)]),
    );
  }
  return value;
}
export async function evidence(projectDir, run) {
  const root = resolve(projectDir, "evidence");
  await mkdir(root, { recursive: true });
  const dir = resolve(
    root,
    run || `${now().slice(0, 10)}-site-check-${randomUUID().slice(0, 8)}`,
  );
  // Non-recursive mkdir is the overwrite guard. An empty existing run also fails.
  await mkdir(dir);
  return {
    dir,
    async json(name, data) {
      await writeFile(
        resolve(dir, name),
        JSON.stringify(redact(data), null, 2) + "\n",
      );
    },
  };
}
export const keptHeaders = [
  "content-type",
  "cache-control",
  "age",
  "x-cache",
  "cf-cache-status",
  "vary",
  "server-timing",
  "content-length",
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "x-robots-tag",
  "location",
];
export function headers(h) {
  return Object.fromEntries(
    Object.entries(h)
      .filter(([k]) => keptHeaders.includes(k.toLowerCase()))
      .map(([k, v]) => [k.toLowerCase(), redact(v)]),
  );
}
export function cacheState(h) {
  const policy = h["cache-control"] || "";
  if (/private|no-store/i.test(policy)) return "private/no-store";
  const explicit = [h["cf-cache-status"], h["x-cache"]]
    .filter(Boolean)
    .join(" / ");
  return explicit || "not reported";
}
export async function request(
  url,
  { timeout = 15000, body = false, maxBytes = 2_000_000, fetcher = fetch } = {},
) {
  const startedAt = now(),
    start = performance.now(),
    chain = [];
  let current = url;
  const signal = AbortSignal.timeout(timeout);
  for (let i = 0; i < 7; i++) {
    const u = new URL(current);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      throw new Error("Expected a public HTTP(S) URL without credentials");
    const response = await fetcher(current, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": "WebTools-SiteCheck/1.0",
        Accept: body
          ? "text/html,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.8"
          : "*/*",
      },
    });
    const ttfbMs = performance.now() - start;
    const h = headers(Object.fromEntries(response.headers));
    chain.push({ url: safeUrl(current), status: response.status, headers: h });
    if (
      [301, 302, 303, 307, 308].includes(response.status) &&
      response.headers.get("location")
    ) {
      await response.body?.cancel();
      current = new URL(response.headers.get("location"), current).href;
      continue;
    }
    let text = "";
    if (body && response.body) {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes)
            throw new Error(`Response exceeds ${maxBytes} bytes`);
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      text = Buffer.concat(chunks).toString("utf8");
    } else await response.body?.cancel();
    return {
      startedAt,
      url: safeUrl(url),
      finalUrl: safeUrl(current),
      status: response.status,
      headers: h,
      chain,
      ttfbMs,
      totalMs: performance.now() - start,
      ...(body ? { text } : {}),
    };
  }
  throw new Error("Too many redirects (maximum 7)");
}
export async function pool(items, concurrency, work) {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) {
        const i = index++;
        await work(items[i], i);
      }
    }),
  );
}
export function performanceSummary(lhr) {
  if (!lhr || lhr.runtimeError)
    throw new Error(
      `Lighthouse did not complete${lhr?.runtimeError?.code ? ` (${lhr.runtimeError.code})` : ""}`,
    );
  const metrics = [
    "first-contentful-paint",
    "largest-contentful-paint",
    "total-blocking-time",
    "cumulative-layout-shift",
    "speed-index",
  ];
  return {
    version: lhr.lighthouseVersion,
    settings: lhr.configSettings,
    environment: lhr.environment,
    finalUrl: safeUrl(
      lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl,
    ),
    scores: Object.fromEntries(
      Object.entries(lhr.categories || {}).map(([k, v]) => [
        k,
        v.score === null ? null : Math.round(v.score * 100),
      ]),
    ),
    metrics: Object.fromEntries(
      metrics.map((k) => [k, lhr.audits?.[k]?.numericValue ?? null]),
    ),
    warnings: lhr.runWarnings || [],
    opportunities: Object.entries(lhr.audits || {})
      .filter(([, a]) => a.score !== null && a.score < 1)
      .map(([id, a]) => ({ id, title: a.title, displayValue: a.displayValue })),
  };
}
export function aggregatePerformance(runs) {
  const groups = new Map();
  for (const r of runs.filter((r) => r.status === "ok")) {
    const key = [r.target.page, r.target.side, r.target.device].join("/");
    if (!groups.has(key)) groups.set(key, { target: r.target, runs: [] });
    groups.get(key).runs.push(r);
  }
  return [...groups.values()].map(({ target, runs }) => ({
    target,
    runs: runs.length,
    performance: stats(runs.map((r) => r.result.scores.performance)),
    metrics: Object.fromEntries(
      [
        "largest-contentful-paint",
        "total-blocking-time",
        "cumulative-layout-shift",
        "speed-index",
      ].map((k) => [k, stats(runs.map((r) => r.result.metrics[k]))]),
    ),
  }));
}
