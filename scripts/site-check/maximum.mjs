import { readFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hostname, platform, release, arch } from "node:os";
import { chromium } from "playwright";
import { crawl } from "../inventory/crawl.mjs";
import { network } from "../inventory/network.mjs";
import { evidence, now, cacheState, stats, redact } from "./core.mjs";
import { collectorProvenance } from "./provenance.mjs";
import {
  validateMaximumProfile,
  layoutParity,
  assessExperiment,
  hash,
} from "./maximum-core.mjs";
import { measureJourney } from "./maximum-browser.mjs";
import { writeMaximumReport } from "./maximum-report.mjs";

export async function runMaximum(project, projectDir, opts) {
  const profile = validateMaximumProfile(
    JSON.parse(
      await readFile(
        resolve(opts.profile || resolve(projectDir, "maximum.json")),
      ),
    ),
    project,
  );
  if (opts.pages)
    throw Error("Maximum pages are defined by profile journeys, not --pages");
  const devices = opts.devices || Object.keys(project.devices);
  if (devices.some((d) => !project.devices[d]))
    throw Error("Unknown maximum investigation device");
  const out = await evidence(projectDir, opts.run, "maximum");
  out.profile = profile;
  const data = {
    version: 1,
    tool: "site-check-maximum",
    project: { id: project.id, name: project.name, sites: project.sites },
    options: opts,
    profile,
    startedAt: now(),
    state: "running",
    crawls: [],
    observations: [],
    experiments: [],
    findings: [],
    evidenceMap: [],
  };
  const save = () => out.json("results.json", data);
  await out.json("profile.json", profile);
  await save();
  let browser;
  try {
    browser = await chromium.launch();
    await out.json("conditions.json", {
      startedAt: data.startedAt,
      node: process.version,
      browser: browser.version(),
      collector: await collectorProvenance(),
      machine: {
        hostname: hostname(),
        platform: platform(),
        release: release(),
        arch: arch(),
      },
      options: opts,
      profileSha256: hash(JSON.stringify(profile)),
      devices: Object.fromEntries(devices.map((d) => [d, project.devices[d]])),
      settings: {
        network: "Host connection; no imposed network/CPU throttling",
        browser:
          "Fresh context per sample; HTTP cache disabled in every variant; service workers and WebSockets blocked; reduced motion; deviceScaleFactor 1",
        http: "Robots-aware crawl, two workers, at least 250 ms between request starts; 15 s timeout, 4 MB decoded document limit; final-hop TTFB excludes pacing",
        trace:
          "Chrome timeline/V8 CPU profiling/user-timing/loading and screenshot events; all sample traces retained, 100 MB limit per trace",
        filmstrip:
          "Up to 24 evenly selected actual screenshot events, with Chrome timestamps; no synthetic frames",
        parity: profile.parity,
      },
      method:
        "Anonymous read-only public documents. Browser non-GET/HEAD requests and off-journey top-level navigation blocked. No authentication or form submission. HTTP crawl precedes browser experiments and can prime CDN/origin caches. Baseline/candidate order alternates by repetition. Ready time is the sum of step initiation through expected element, loaded fonts and complete visible images; excludes evidence writing between steps. Traces and capture instrumentation add overhead. Navigation metrics on SPA steps refer to the existing document. Observed LCP/CLS are snapshots at readiness, not field Core Web Vitals. No automatic deployment or fix-proof claim.",
      references: [
        "https://chromedevtools.github.io/devtools-protocol/tot/Tracing/",
        "https://chromedevtools.github.io/devtools-protocol/tot/Network/",
      ],
    });
    for (const site of project.sites) {
      const item = { site, state: "running", rows: [] };
      data.crawls.push(item);
      await save();
      try {
        const net = network(site.baseUrl);
        const result = await crawl(
          site,
          project,
          {
            depth: profile.crawl.depth,
            "max-urls": profile.crawl.maxUrls,
            "max-sitemaps": profile.crawl.maxSitemaps,
          },
          net,
          async (rows) => {
            await appendFile(
              resolve(out.dir, `crawl-${site.id}-progress.jsonl`),
              JSON.stringify(redact(rows.at(-1))) + "\n",
            );
            if (rows.length % 25 === 0)
              console.log(`maximum crawl ${site.id}: ${rows.length} documents`);
          },
        );
        Object.assign(item, result);
        await save();
        const candidates = item.rows.filter(
          (r) => r.collection === "ok" && r.status === 200 && r.html,
        );
        let stopped = result.coverage.errors.some((e) =>
          /^Stopped after HTTP (429|503)/.test(e),
        );
        for (const [i, row] of candidates.entries()) {
          if (stopped) {
            row.repeat = {
              state: "skipped",
              error:
                "Repeat probes stopped after rate limiting or server unavailability",
            };
            continue;
          }
          try {
            const r = await net.request(row.url);
            row.repeat = {
              state: r.status === 200 ? "complete" : "partial",
              status: r.status,
              finalUrl: r.finalUrl,
              headers: r.headers,
              ttfbMs: r.ttfbMs,
              startedAt: r.startedAt,
              sha256: hash(r.buffer),
              sameBody: hash(r.buffer) === row.sha256,
            };
            if ([429, 503].includes(r.status)) stopped = true;
          } catch (error) {
            row.repeat = { state: "partial", error: error.message };
          }
          if ((i + 1) % 25 === 0) {
            console.log(
              `maximum cache ${site.id}: ${i + 1}/${candidates.length} repeat probes`,
            );
            await save();
          }
        }
        const grouped = {};
        for (const row of item.rows)
          for (const r of [row, row.repeat])
            if (r && Number.isFinite(r.ttfbMs))
              (grouped[cacheState(r.headers || {})] ??= []).push(r.ttfbMs);
        item.cacheGroups = Object.fromEntries(
          Object.entries(grouped).map(([state, values]) => [
            state,
            stats(values),
          ]),
        );
        item.state =
          result.coverage.complete &&
          !item.rows.some(
            (r) =>
              r.collection !== "ok" ||
              r.status >= 400 ||
              (r.repeat && r.repeat.state !== "complete"),
          )
            ? "complete"
            : "partial";
      } catch (error) {
        item.state = "partial";
        item.error = error.message;
      }
      await out.json(`crawl-${site.id}.json`, item);
      data.evidenceMap.push({
        file: `crawl-${site.id}.json`,
        kind: "HTTP crawl, coverage and cache probes",
        sha256: hash(await readFile(resolve(out.dir, `crawl-${site.id}.json`))),
      });
      await save();
      if (
        item.coverage?.errors.some((e) =>
          /^Stopped after HTTP (429|503)/.test(e),
        ) ||
        item.rows.some(
          (r) => r.repeat?.status === 429 || r.repeat?.status === 503,
        )
      )
        throw Error(
          "Source returned HTTP 429/503; remaining investigation work stopped",
        );
    }
    let serial = 0;
    async function measure(journey, side, device, label, block = []) {
      const id = `${String(++serial).padStart(4, "0")}-${label}-${device}`;
      const row = await measureJourney(
        browser,
        project,
        journey,
        side,
        device,
        out,
        id,
        block,
      );
      await out.json(`measurements/${id}/result.json`, row);
      row.resultFile = `measurements/${id}/result.json`;
      data.evidenceMap.push(...row.artifacts, {
        file: row.resultFile,
        kind: "Journey measurements and network requests",
        sha256: hash(await readFile(resolve(out.dir, row.resultFile))),
      });
      console.log(
        `maximum journey ${id}: ${row.state}${row.error || row.traceError ? ` — ${row.error || row.traceError}` : ""}`,
      );
      return row;
    }
    for (const journey of profile.journeys)
      for (const site of project.sites)
        for (const device of devices) {
          data.observations.push(
            await measure(journey, site.id, device, `${journey.id}-${site.id}`),
          );
          await save();
        }
    for (const spec of profile.experiments)
      for (const device of devices) {
        const e = { spec, device, pairs: [], state: "running" };
        data.experiments.push(e);
        await save();
        const journey = profile.journeys.find((j) => j.id === spec.journey);
        const sides =
          spec.kind === "ablation"
            ? [spec.site]
            : [spec.baselineSite, spec.candidateSite];
        if (
          data.observations.some(
            (r) =>
              r.journey === journey.id &&
              r.device === device &&
              sides.includes(r.side) &&
              r.state !== "complete",
          )
        ) {
          e.error = "An initial journey failed; experiment not repeated";
          e.assessment = assessExperiment(spec, [], profile.repetitions);
          e.state = "partial";
          await save();
          continue;
        }
        for (let rep = 0; rep < profile.repetitions; rep++) {
          const pair = {
            repetition: rep + 1,
            order:
              rep % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"],
          };
          for (const variant of pair.order) {
            const side =
              spec.kind === "ablation" ? spec.site : spec[`${variant}Site`];
            pair[variant] = await measure(
              journey,
              side,
              device,
              `${spec.id}-r${rep + 1}-${variant}`,
              spec.kind === "ablation" && variant === "candidate"
                ? spec.block
                : [],
            );
            await save();
          }
          pair.parity = { passed: false, steps: [] };
          if (
            pair.baseline.state === "complete" &&
            pair.candidate.state === "complete"
          ) {
            for (const [i, a] of pair.baseline.steps.entries()) {
              const b = pair.candidate.steps[i];
              const p = layoutParity(
                a.layout,
                b.layout,
                profile.parity,
                await readFile(resolve(out.dir, a.capture.file)),
                await readFile(resolve(out.dir, b.capture.file)),
              );
              pair.parity.steps.push({
                page: a.page,
                ...p,
                baseline: a.capture.file,
                candidate: b.capture.file,
              });
            }
            pair.parity.passed =
              pair.parity.steps.length === journey.steps.length &&
              pair.parity.steps.every((s) => s.passed);
          }
          e.pairs.push(pair);
          await save();
        }
        e.assessment = assessExperiment(spec, e.pairs, profile.repetitions);
        e.state = e.assessment.complete ? "complete" : "partial";
        await save();
      }
  } catch (error) {
    data.failure = error.message;
  } finally {
    await browser?.close();
    for (const c of data.crawls)
      data.findings.push({
        number: data.findings.length + 1,
        label: c.state === "complete" ? "confirmed" : "unresolved",
        title: `${c.site.label}: crawl and cache observations`,
        detail: `${c.rows.length} URLs collected; ${c.state} within configured crawl bounds. Header groups are observations, not proof of cache effectiveness or bypass. HTTP timings include both first and repeat observations where available.`,
        evidence: [`crawl-${c.site.id}.json`],
        limitations: c.coverage
          ? {
              limits: c.coverage.limits,
              errors: c.coverage.errors,
              exclusions: c.coverage.exclusions,
              depth: c.coverage.depth,
            }
          : c.error,
      });
    for (const e of data.experiments)
      data.findings.push({
        number: data.findings.length + 1,
        label: e.assessment?.label || "unresolved",
        title: `${e.spec.question} (${e.device})`,
        detail: e.assessment?.conclusion || "Experiment did not finish.",
        evidence: e.pairs.flatMap((p) =>
          ["baseline", "candidate"]
            .map((v) => p[v]?.resultFile)
            .filter(Boolean),
        ),
        limitations: e.assessment?.limitations,
      });
    if (!profile.experiments.length)
      data.findings.push({
        number: data.findings.length + 1,
        label: "unresolved",
        title: "No causal experiment configured",
        detail:
          "Journey and crawl observations alone cannot identify a cause or prove a fix.",
        evidence: [],
      });
    if (profile.experiments.length && !data.experiments.length)
      data.findings.push({
        number: data.findings.length + 1,
        label: "unresolved",
        title: "Configured experiments not run",
        detail:
          data.failure ||
          "Collection stopped before experiment samples could be measured.",
        evidence: [],
      });
    for (const r of data.observations.filter((r) => r.state !== "complete"))
      data.findings.push({
        number: data.findings.length + 1,
        label: "unresolved",
        title: `Journey incomplete: ${r.journey} / ${r.side} / ${r.device}`,
        detail: r.error || r.traceError,
        evidence: [r.resultFile],
      });
    data.state =
      !data.failure &&
      data.crawls.every((c) => c.state === "complete") &&
      data.observations.every((r) => r.state === "complete") &&
      data.experiments.every((e) => e.state === "complete")
        ? "complete"
        : "partial";
    data.finishedAt = now();
    await out.json("evidence-map.json", data.evidenceMap);
    await save();
    await writeMaximumReport(out.dir, data);
    console.log(
      `Report: ${out.dir}/report.html\nMaximum collection: ${data.state}`,
    );
  }
  return data;
}
