import { readFile, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { collectWatchCapture } from "./watch/capture.mjs";
import { loadProject, projectDir } from "./project.mjs";
import { collectorProvenance } from "./site-check/provenance.mjs";
import {
  watchOptions,
  watchSelection,
  watchPolicy,
  createWatchRun,
  baselineFor,
  loadBaseline,
  acceptBaseline,
  digest,
  readWatchRun,
  watchState,
} from "./watch/core.mjs";
import { writeWatchReport } from "./watch/report.mjs";

export function checkFindings(data) {
  const findings = [];
  for (const [module, rows] of Object.entries(data.results))
    for (const r of rows) {
      const key = `${module}/${r.target.side}/${r.target.page}/${r.target.device}`;
      if (r.status !== "ok") {
        findings.push(`${key}: ${r.status}`);
        continue;
      }
      const x = r.result;
      if (module === "accessibility")
        for (const v of x.violations)
          findings.push(`${key}: ${v.id} (${v.nodes.length} elements)`);
      if (module === "security") {
        for (const h of x.missingHeaders) findings.push(`${key}: missing ${h}`);
        if (!x.redirect.https)
          findings.push(`${key}: HTTP redirect is not HTTPS`);
      }
      if (module === "discovery") {
        if (!x.title) findings.push(`${key}: missing title`);
        if (x.canonicals.length !== 1)
          findings.push(`${key}: ${x.canonicals.length} canonicals`);
        if (x.httpStatus !== 200) findings.push(`${key}: HTTP ${x.httpStatus}`);
      }
    }
  return [...new Set(findings)].sort();
}
async function minimalCheck(project, selected, out) {
  const run = `${out.name}-check`;
  if (run.length > 80)
    throw new Error("Watch run name is too long for the site-check child run");
  const args = [
    "--env-file-if-exists=.env",
    "scripts/site-check.mjs",
    "--tier",
    "minimal",
    "--run",
    run,
    "--sites",
    selected[0].side,
    "--pages",
    [...new Set(selected.map((t) => t.page))].join(","),
    "--devices",
    [...new Set(selected.map((t) => t.device))].join(","),
  ];
  const code = await new Promise((res, rej) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, PROJECT: project.id },
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.once("error", rej);
    child.once("close", res);
  });
  const source = resolve(projectDir, "evidence", run),
    data = JSON.parse(await readFile(resolve(source, "results.json"), "utf8"));
  if (![0, 2].includes(code))
    throw new Error(`Site-check runner exited ${code}`);
  await cp(source, resolve(out.dir, "site-check"), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  return {
    state: data.state,
    report: "site-check/report.html",
    run,
    findings: checkFindings(data),
  };
}
async function main() {
  const opts = watchOptions();
  if (opts.help) {
    console.log(
      "Watch: PROJECT=<id> npm run watch -- [run] [--site live|before|after] [--pages home] [--devices mobile] [--run unique-name]\nAccept: npm run watch -- accept --run <reviewed-run>\nOffline report: npm run watch -- --render <run-name>\n--skip-site-check explicitly runs visual/assertion checks only.",
    );
    return;
  }
  const project = await loadProject({ siteCheck: true });
  if (opts.action === "accept") {
    if (!opts.run) throw new Error("Accept needs --run <reviewed-run>");
    const pointer = await acceptBaseline(projectDir, opts.run, project);
    console.log(`Accepted baseline: ${pointer.run} (${pointer.site})`);
    return;
  }
  if (opts.render) {
    const { dir, data } = await readWatchRun(projectDir, opts.render);
    await writeWatchReport(dir, data);
    console.log(`Rebuilt ${dir}/report.html`);
    return;
  }
  const selected = watchSelection(project, opts),
    policy = watchPolicy(project, selected, {
      siteCheck: !opts["skip-site-check"],
    });
  if (policy.siteCheck && !process.env.PAGESPEED_INSIGHTS_API_KEY)
    throw new Error(
      "Set PAGESPEED_INSIGHTS_API_KEY in .env, or explicitly use --skip-site-check",
    );
  const site = selected[0].side,
    out = await createWatchRun(projectDir, opts.run);
  const pointer = await baselineFor(projectDir, site);
  let baseline = null,
    baselineProblem;
  try {
    baseline = await loadBaseline(projectDir, pointer);
    if (baseline && baseline.data.policy.sha256 !== policy.sha256) {
      baselineProblem =
        "Page scope, viewports, assertions or comparison settings changed. Review a new baseline; no previous capture was treated as unchanged.";
      baseline = null;
    }
  } catch (error) {
    baselineProblem = error.message;
  }
  const data = {
    version: 1,
    tool: "watch",
    project: { id: project.id, name: project.name },
    run: out.name,
    site,
    startedAt: new Date().toISOString(),
    policy,
    baseline: pointer,
    baselineProblem,
    rows: [],
    state: "running",
  };
  const browser = await chromium.launch();
  try {
    const sourceFiles = [
      "scripts/watch.mjs",
      "scripts/capture-page.mjs",
      ...["core", "compare", "report", "capture"].map(
        (n) => `scripts/watch/${n}.mjs`,
      ),
    ];
    const sources = await Promise.all(
      sourceFiles.map(async (file) => ({
        file,
        sha256: digest(await readFile(file)),
      })),
    );
    const collector = await collectorProvenance();
    await out.json("conditions.json", {
      startedAt: data.startedAt,
      node: process.version,
      browser: browser.version(),
      collector,
      watchCollectorSha256: digest(
        JSON.stringify({ collector: collector.sha256, sources }),
      ),
      watchSources: sources,
      policy,
      settings: {
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
        animations: "disabled",
        maxHeight: 50000,
        maxPixels: 24000000,
        scrollLimit: 150,
        images:
          "Scroll, wait for visible images, verify displayed images across the document",
        contentVisibility: "Forced visible during the screenshot",
      },
      siteCheck: policy.siteCheck ? "minimal" : "explicitly skipped",
    });
    for (const target of selected) {
      const row = await collectWatchCapture(
        browser,
        target,
        policy,
        out,
        baseline,
      );
      data.rows.push(row);
      await out.json("results.json", data);
      console.log(
        `watch: ${target.page}/${target.device}: ${row.status}${row.diff ? (row.diff.changed ? " changed" : " unchanged") : ""}`,
      );
    }
  } catch (error) {
    data.failure = error.message;
    throw error;
  } finally {
    await browser.close();
  }
  if (policy.siteCheck) {
    try {
      data.siteCheck = await minimalCheck(project, selected, out);
    } catch (error) {
      data.siteCheck = { state: "error", error: error.message };
    }
  } else
    data.siteCheck = {
      state: "skipped",
      reason: "Minimal site check explicitly skipped for this run",
    };
  const before = new Set(baseline?.data.siteCheck?.findings || []),
    current = new Set(data.siteCheck.findings || []);
  data.siteCheckChanges = baseline
    ? [
        ...[...current].filter((v) => !before.has(v)).map((v) => `New: ${v}`),
        ...[...before]
          .filter((v) => !current.has(v))
          .map((v) => `Resolved: ${v}`),
      ]
    : [];
  data.state = watchState(data, Boolean(baseline));
  data.finishedAt = new Date().toISOString();
  await out.json("results.json", data);
  await writeWatchReport(out.dir, data);
  console.log(`Report: ${out.dir}/report.html`);
  console.log(`Watch state: ${data.state}`);
  if (data.state !== "quiet")
    process.exitCode = data.state === "baseline-required" ? 3 : 2;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === new URL(import.meta.url).pathname
)
  main().catch((error) => {
    console.error(`Watch: ${error.message}`);
    process.exitCode = 1;
  });
