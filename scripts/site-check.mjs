import { runMaximum } from "./site-check/maximum.mjs";
import { writeMaximumReport } from "./site-check/maximum-report.mjs";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { hostname, platform, release, arch, cpus, totalmem } from "node:os";
import { createRequire } from "node:module";
import { loadProject, projectDir } from "./project.mjs";
import {
  options,
  targets,
  evidence,
  now,
  rotate,
  request,
  pool,
  safeUrl,
  aggregatePerformance,
  cacheState,
  stats,
} from "./site-check/core.mjs";
import { chromium, inspect, browserLoads } from "./site-check/browser.mjs";
import {
  pagespeed,
  localLighthouse,
  throttling,
} from "./site-check/performance.mjs";
import { sitemap } from "./site-check/sitemap.mjs";
import {
  transport,
  emailRecords,
  httpRedirect,
} from "./site-check/security.mjs";
import { writeReport } from "./site-check/report.mjs";
import { collectorProvenance } from "./site-check/provenance.mjs";
const require = createRequire(import.meta.url);
async function main() {
  const opts = options();
  if (opts.help) {
    console.log(
      `Site check: --tier minimal|standard|maximum --modules performance,cache,accessibility,security,discovery\nOptional: --pages home,gallery --devices mobile,desktop --sites before,after --run unique-name\nMaximum: --tier maximum [--profile projects/<id>/maximum.json] (investigation profile, no --modules)\nRebuild a saved report: --render projects/<id>/evidence/<run>\nPROJECT selects a project; PAGESPEED_INSIGHTS_API_KEY is loaded from .env.\nExit 0: collection complete (findings may need review); 2: collection partial; 1: setup failure.`,
    );
    return;
  }
  if (opts.render) {
    const dir = resolve(opts.render),
      root = resolve(projectDir, "evidence") + sep;
    if (!dir.startsWith(root))
      throw new Error(
        "--render must name an evidence folder in the selected project",
      );
    const data = JSON.parse(
      await readFile(resolve(dir, "results.json"), "utf8"),
    );
    if (data.tool === "site-check-maximum") await writeMaximumReport(dir, data);
    else await writeReport(dir, data);
    console.log(`Rebuilt ${dir}/report.html`);
    return;
  }
  let project = await loadProject({ siteCheck: true });
  if (opts.sites) {
    if (opts.sites.some((id) => !project.sites.some((s) => s.id === id)))
      throw new Error("Unknown site selection");
    project = {
      ...project,
      sites: project.sites.filter((s) => opts.sites.includes(s.id)),
    };
  }
  if (opts.tier === "maximum") {
    const data = await runMaximum(project, projectDir, opts);
    if (data.state !== "complete") process.exitCode = 2;
    return;
  }
  const allTargets = targets(project, opts),
    key = process.env.PAGESPEED_INSIGHTS_API_KEY;
  if (opts.tier === "minimal" && opts.modules.includes("performance") && !key)
    throw new Error(
      "Set PAGESPEED_INSIGHTS_API_KEY in .env (or the environment) for minimal performance checks",
    );
  const out = await evidence(projectDir, opts.run),
    started = performance.now();
  const sideIds = project.sites.map((s) => s.id);
  const baseFor = (side) => project.sites.find((s) => s.id === side).baseUrl;
  const data = {
    version: 1,
    project: {
      id: project.id,
      name: project.name,
      labels: project.labels,
      sites: project.sites,
      beforeBase: project.beforeBase,
      afterBase: project.afterBase,
    },
    options: opts,
    startedAt: now(),
    state: "running",
    preflight: [],
    results: Object.fromEntries(opts.modules.map((m) => [m, []])),
    sites: {},
    browserLoads: [],
  };
  const browser = await chromium.launch();
  const conditions = {
    startedAt: data.startedAt,
    node: process.version,
    collector: await collectorProvenance(),
    browser: browser.version(),
    versions: Object.fromEntries(
      [
        "playwright",
        "@axe-core/playwright",
        "lighthouse",
        "puppeteer-core",
        "fast-xml-parser",
      ].map((p) => [
        p,
        require(resolve("node_modules", p, "package.json")).version,
      ]),
    ),
    machine: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
    },
    options: opts,
    devices: project.devices,
    settings: {
      lighthouse: {
        throttlingMethod: "simulate",
        throttling,
        deviceScaleFactor: 1,
      },
      browser: {
        network: "host connection, no imposed throttling",
        deviceScaleFactor: 1,
        locale: "en-GB",
        timezone: "Europe/London",
      },
      pagespeed: {
        service: "Google PageSpeed Insights v5",
        strategies:
          "mobile/desktop presets; returned settings saved with each result",
        concurrency: 4,
      },
      sitemap: { maxDocuments: 6, sampleSize: 12 },
      internalLinks: { perPage: 50 },
      http: { timeoutMs: 15000, redirectLimit: 7 },
    },
    method:
      "Local browser measurements run serially; sites rotate order per Lighthouse repetition and cache pair. Every browser page uses a fresh context except its repeat-load partner. Availability probes may prime origin/CDN caches. No authentication or form submissions. Credential values and cookie headers excluded.",
  };
  await out.json("conditions.json", conditions);
  let pendingSave = Promise.resolve();
  const save = () => {
    data.durationMs = performance.now() - started;
    pendingSave = pendingSave.then(() => out.json("results.json", data));
    return pendingSave;
  };
  let rawIndex = 0;
  async function collect(module, target, work) {
    const row = { target, at: now(), status: "ok" };
    try {
      const value = await work();
      row.result = value.summary ?? value;
      if (value.raw) {
        row.raw = `raw-${String(++rawIndex).padStart(4, "0")}.json`;
        await out.json(row.raw, value.raw);
      }
    } catch (e) {
      row.status = "error";
      row.error = e.message;
    }
    data.results[module].push(row);
    await save();
    console.log(
      `${module}: ${target.side}/${target.page}/${target.device}: ${row.status}${row.error ? ` — ${row.error}` : ""}`,
    );
    return row;
  }
  try {
    // Prove page health before scheduling any measurement against it.
    for (const target of allTargets) {
      const row = { target, status: "ok", at: now() };
      try {
        row.result = await inspect(browser, target, {
          accessibility: opts.modules.includes("accessibility"),
          standard: opts.tier === "standard",
        });
      } catch (e) {
        row.status = "skipped";
        row.error = e.message;
      }
      data.preflight.push(row);
      console.log(
        `availability: ${target.side}/${target.page}/${target.device}: ${row.status}`,
      );
      if (row.status !== "ok")
        for (const m of opts.modules)
          data.results[m].push({
            target,
            status: "skipped",
            reason: row.error,
          });
      if (row.status === "ok" && opts.modules.includes("accessibility"))
        data.results.accessibility.push({
          target,
          status: row.result.accessibility.error ? "error" : "ok",
          error: row.result.accessibility.error,
          at: row.at,
          result: row.result.accessibility,
        });
      await save();
    }
    const available = data.preflight.filter((r) => r.status === "ok");
    if (
      opts.tier === "standard" &&
      (opts.modules.includes("cache") || opts.modules.includes("discovery"))
    ) {
      for (const side of sideIds) {
        data.sites[side] ??= {};
        data.sites[side].sitemap = await sitemap(baseFor(side));
        await save();
      }
    }
    if (opts.modules.includes("cache")) {
      const urls = new Map(
        available.map((r) => [r.target.url, { ...r.target, device: "HTTP" }]),
      );
      if (opts.tier === "standard")
        for (const side of sideIds) {
          for (const url of data.sites[side].sitemap.sample)
            if (!urls.has(url)) {
              const target = {
                page: new URL(url).pathname,
                label: new URL(url).pathname,
                side,
                device: Object.keys(project.devices)[0],
                viewport: Object.values(project.devices)[0],
                url,
                sitemapSample: true,
              };
              try {
                await inspect(browser, target);
                urls.set(url, { ...target, device: "HTTP" });
              } catch (e) {
                data.results.cache.push({
                  target: { ...target, device: "HTTP" },
                  status: "skipped",
                  reason: e.message,
                });
              }
            }
        }
      const groups = new Map();
      for (const t of urls.values()) {
        if (!groups.has(t.side)) groups.set(t.side, []);
        groups.get(t.side).push(t);
      }
      const measured = new Map([...urls.keys()].map((u) => [u, []]));
      const failures = new Map();
      for (let rep = 0; rep < 2; rep++)
        for (const side of rotate([...groups.keys()], rep))
          for (const target of groups.get(side)) {
            for (const mode of ["plain", "unique-query"]) {
              const u = new URL(target.url);
              if (mode === "unique-query")
                u.searchParams.set(
                  "_site_check",
                  `${Date.now()}-${rep}-${Math.random().toString(36).slice(2)}`,
                );
              try {
                const r = await request(u.href);
                if (r.status < 200 || r.status >= 300)
                  throw new Error(`HTTP ${r.status}`);
                measured
                  .get(target.url)
                  .push({ ...r, mode, repetition: rep + 1 });
              } catch (e) {
                failures.set(target.url, e.message);
              }
              await out.json("cache-requests.json", {
                runs: [...measured.values()].flat(),
                errors: Object.fromEntries(failures),
              });
              console.log(
                `cache request: ${target.side}/${target.page} ${rep + 1}/2 ${mode}: ${failures.has(target.url) ? "error" : "saved"}`,
              );
            }
          }
      for (const target of urls.values()) {
        const runs = measured.get(target.url);
        const row = await collect("cache", target, async () => {
          if (failures.has(target.url))
            throw new Error(failures.get(target.url));
          return runs;
        });
        if (row.status !== "ok") row.partialResults = runs;
      }
      data.cacheGroups = Object.fromEntries(
        sideIds.map((side) => [
          side,
          Object.fromEntries(
            [
              ...new Set(
                [...urls.values()]
                  .filter((t) => t.side === side)
                  .flatMap((t) =>
                    measured.get(t.url).map((r) => cacheState(r.headers)),
                  ),
              ),
            ].map((state) => [
              state,
              stats(
                [...urls.values()]
                  .filter((t) => t.side === side)
                  .flatMap((t) => measured.get(t.url))
                  .filter((r) => cacheState(r.headers) === state)
                  .map((r) => r.ttfbMs),
              ),
            ]),
          ),
        ]),
      );
      await save();
    }
    if (opts.modules.includes("security")) {
      if (opts.tier === "standard")
        for (const side of sideIds) {
          data.sites[side] ??= {};
          data.sites[side].security = {
            tls: await transport(baseFor(side)),
            email: await emailRecords(baseFor(side)),
          };
          await save();
        }
      const redirects = new Map();
      for (const row of available)
        await collect("security", row.target, async () => {
          const x = row.result;
          if (!redirects.has(row.target.url))
            redirects.set(row.target.url, await httpRedirect(row.target.url));
          return {
            headers: x.headers,
            chain: x.chain,
            redirect: redirects.get(row.target.url),
            missingHeaders: [
              "strict-transport-security",
              "content-security-policy",
              "x-content-type-options",
              "referrer-policy",
            ].filter((k) => !x.headers[k]),
            ...(opts.tier === "standard"
              ? {
                  forms: x.metadata.forms.map((f) => ({
                    ...f,
                    action: safeUrl(f.action),
                    https: new URL(f.action).protocol === "https:",
                  })),
                }
              : {}),
          };
        });
    }
    if (opts.modules.includes("discovery")) {
      const linkCache = new Map();
      for (const row of available)
        await collect("discovery", row.target, async () => {
          const x = row.result,
            m = x.metadata;
          const result = {
            httpStatus: x.status,
            title: m.title,
            canonicals: m.canonicals,
            indexing: [
              ...m.robots,
              ...m.googlebot,
              ...(x.headers["x-robots-tag"] ? [x.headers["x-robots-tag"]] : []),
            ],
          };
          if (opts.tier === "standard") {
            result.sharing = m.sharing;
            result.sharingMissing = [
              "description",
              "og:title",
              "og:description",
              "og:url",
              "og:image",
              "twitter:card",
            ].filter((k) => m.sharing[k].length !== 1 || !m.sharing[k][0]);
            const links = [
              ...new Set(
                m.links.map((u) => {
                  const x = new URL(u);
                  x.hash = "";
                  return x.href;
                }),
              ),
            ].filter(
              (u) =>
                !/[?&](action|logout|delete|remove|add-to-cart|token|nonce)=|\/(logout|signout|wp-admin|wp-login\.php)(\/|\?|$)/i.test(
                  u,
                ),
            );
            const sampled = links.slice(0, 50),
              checked = [];
            await pool(sampled, 3, async (url) => {
              if (!linkCache.has(url))
                linkCache.set(
                  url,
                  request(url)
                    .then((r) => ({
                      url,
                      status: r.status,
                      finalUrl: r.finalUrl,
                    }))
                    .catch((e) => ({ url, error: e.message })),
                );
              checked.push(await linkCache.get(url));
            });
            result.links = {
              total: links.length,
              checked: sampled.length,
              limit: 50,
              broken: checked.filter((r) => r.status >= 400),
              errors: checked.filter((r) => r.error),
              results: checked,
            };
            const sm = data.sites[row.target.side].sitemap;
            const paths = sm.urls.map(
              (u) => new URL(u).pathname.replace(/\/$/, "") || "/",
            );
            result.sitemap = paths.includes(
              new URL(row.target.url).pathname.replace(/\/$/, "") || "/",
            )
              ? "listed"
              : sm.complete
                ? "not listed"
                : "not found in bounded sitemap sample";
          }
          return result;
        });
    }
    if (opts.modules.includes("performance")) {
      if (opts.tier === "minimal")
        await pool(available, 4, async (row) =>
          collect("performance", row.target, () => pagespeed(row.target, key)),
        );
      else {
        for (let rep = 0; rep < 3; rep++)
          for (const page of project.pages)
            for (const device of Object.keys(project.devices))
              for (const side of rotate(sideIds, rep)) {
                const row = available.find(
                  (r) =>
                    r.target.page === page.id &&
                    r.target.device === device &&
                    r.target.side === side,
                );
                if (row) {
                  const r = await collect("performance", row.target, () =>
                    localLighthouse(row.target),
                  );
                  r.repetition = rep + 1;
                  await save();
                }
              }
        for (const row of available) {
          const entry = { target: row.target, status: "ok" };
          try {
            entry.result = await browserLoads(browser, row.target);
            entry.raw = `browser-${row.target.page}-${row.target.side}-${row.target.device}.json`;
            await out.json(entry.raw, entry.result);
          } catch (e) {
            entry.status = "error";
            entry.error = e.message;
          }
          data.browserLoads.push(entry);
          await save();
        }
      }
      data.performanceSummary = aggregatePerformance(data.results.performance);
    }
  } catch (error) {
    data.failure = error.message;
    throw error;
  } finally {
    await browser.close();
    data.finishedAt = now();
    data.state =
      data.failure ||
      data.preflight.some((r) => r.status !== "ok") ||
      Object.values(data.results)
        .flat()
        .some((r) => r.status !== "ok") ||
      data.browserLoads.some((r) => r.status !== "ok")
        ? "partial"
        : "complete";
    await save();
    await writeReport(out.dir, data);
    console.log(`Report: ${out.dir}/report.html`);
    console.log(
      `Collection ${data.state}: ${(data.durationMs / 1000).toFixed(1)} s`,
    );
    if (data.state !== "complete") process.exitCode = 2;
  }
}
main().catch((e) => {
  console.error(`Site check: ${e.message}`);
  process.exitCode = 1;
});
