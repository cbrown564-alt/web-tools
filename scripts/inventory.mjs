import {
  readFile,
  writeFile,
  appendFile,
  mkdir,
  copyFile,
  rename,
} from "node:fs/promises";
import { resolve } from "node:path";
import { hostname, platform, release, arch } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadProject, projectDir } from "./project.mjs";
import { evidence, redact, safeUrl } from "./site-check/core.mjs";
import { captureInventoryPage } from "./inventory/capture.mjs";
import {
  inventoryOptions,
  selectSite,
  captureSelection,
  reconcile,
  hash,
  inScope,
} from "./inventory/core.mjs";
import { network } from "./inventory/network.mjs";
import { crawl } from "./inventory/crawl.mjs";
import { writeInventoryReport } from "./inventory/report.mjs";
import { help } from "./cli/grammar.mjs";
import { nextRunName, resolveRun } from "./cli/runs.mjs";
import { report as reportError } from "./cli/errors.mjs";
export async function main(args = process.argv.slice(2)) {
  const opts = inventoryOptions(args);
  if (opts.help) {
    console.log(help("inventory"));
    return;
  }
  const project = await loadProject({ siteCheck: true });
  if (opts.render) {
    const dir = resolve(
        projectDir,
        "evidence",
        await resolveRun(projectDir, opts.render, "inventory"),
      ),
      data = JSON.parse(await readFile(resolve(dir, "results.json")));
    if (data.tool !== "inventory" || data.project.id !== project.id)
      throw Error("Not an inventory for this project");
    await writeInventoryReport(dir, data);
    console.log(`Rebuilt ${dir}/report.html`);
    return;
  }
  const site = selectSite(project, opts),
    run = opts.run || nextRunName(projectDir, "inventory"),
    out = await evidence(projectDir, run);
  await mkdir(resolve(out.dir, "captures"));
  const startedAt = new Date().toISOString(),
    sourceFiles = [
      "package.json",
      "package-lock.json",
      "scripts/project.mjs",
      "scripts/report.mjs",
      "scripts/capture-page.mjs",
      "scripts/site-check/browser.mjs",
      "scripts/site-check/core.mjs",
      "scripts/site-check/sitemap.mjs",
      "scripts/inventory.mjs",
      ...["core", "network", "crawl", "report", "capture"].map(
        (n) => `scripts/inventory/${n}.mjs`,
      ),
    ];
  const files = await Promise.all(
    sourceFiles.map(async (file) => ({
      file,
      sha256: hash(await readFile(file)),
    })),
  );
  const conditions = {
    startedAt,
    node: process.version,
    machine: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      arch: arch(),
    },
    collector: { sha256: hash(JSON.stringify(files)), files },
    options: opts,
    devices: project.devices,
    http: {
      concurrency: 2,
      minimumRequestIntervalMs: 250,
      maxBytes: 4000000,
      timeoutMs: 15000,
    },
    capture: {
      scope: "Full page",
      maxHeight: 50000,
      maxPixels: 24000000,
      maxAttempts: 3,
      reducedMotion: "reduce",
    },
  };
  await out.json("conditions.json", conditions);
  const data = {
    version: 1,
    tool: "inventory",
    project: { id: project.id, name: project.name },
    site,
    run,
    startedAt,
    options: opts,
    state: "running",
    rows: [],
  };
  let history;
  if (
    project.inventory?.history &&
    project.sites.some((s) => s.id === site.id)
  ) {
    const file = resolve(projectDir, project.inventory.history);
    if (!file.startsWith(projectDir + "/"))
      throw Error("History must be inside project folder");
    history = JSON.parse(await readFile(file));
  }
  try {
    const result = await crawl(
      site,
      project,
      opts,
      network(site.baseUrl),
      async (rows, progress) => {
        await appendFile(
          resolve(out.dir, "progress.jsonl"),
          JSON.stringify(redact(rows.at(-1))) + "\n",
        );
        if (rows.length % 25 === 0)
          console.log(
            `inventory: ${rows.length} collected / ${progress.known} discovered`,
          );
      },
      history,
    );
    Object.assign(data, result);
    if (history) {
      data.reconciliation = reconcile(data.rows, history, site.baseUrl);
      await out.json("reconciliation.json", data.reconciliation);
    }
    const selected = captureSelection(
        data.rows,
        project,
        site,
        opts.captures,
        opts["capture-limit"],
      ),
      devices = Object.entries(project.devices).filter(
        ([id]) => !opts.devices || opts.devices.includes(id),
      );
    data.captureCoverage = {
      selectedPages: selected.length,
      eligiblePages: data.rows.filter(
        (r) => r.status >= 200 && r.status < 300 && r.html,
      ).length,
      devices: devices.map(([id]) => id),
    };
    if (selected.length) {
      const browser = await chromium.launch();
      conditions.browser = browser.version();
      await out.json("conditions.json", conditions);
      try {
        for (const [i, row] of selected.entries())
          for (const [device, viewport] of devices) {
            const c = await captureInventoryPage(
              browser,
              row,
              device,
              viewport,
              out,
              site.baseUrl,
              `captures/${String(i + 1).padStart(4, "0")}-${device}.png`,
            );
            row.captures.push(c);
            console.log(
              `capture: ${i + 1}/${selected.length} ${device}: ${c.status}`,
            );
            await out.json("results.json", data);
          }
      } finally {
        await browser.close();
      }
    }
    data.state =
      data.coverage.complete &&
      !data.rows.some((r) => r.captures.some((c) => c.status === "error"))
        ? "complete"
        : "partial";
  } catch (e) {
    data.state = "partial";
    data.failure = e.message;
    data.coverage ||= {
      complete: false,
      uniqueSitemapUrls: 0,
      documents: [],
      exclusions: {},
      limits: [],
      errors: [e.message],
    };
    data.captureCoverage ||= {
      selectedPages: 0,
      eligiblePages: 0,
      devices: [],
    };
  }
  if (opts.compare) {
    const previousDir = resolve(
        projectDir,
        "evidence",
        await resolveRun(projectDir, opts.compare, "inventory", {
          test: (r) => r.name !== run,
        }),
      ),
      prior = JSON.parse(await readFile(resolve(previousDir, "results.json")));
    if (
      prior.tool !== "inventory" ||
      prior.project.id !== project.id ||
      !prior.finishedAt
    )
      throw Error("Comparison needs a finished inventory of this project");
    await mkdir(resolve(out.dir, "comparison", "captures"), {
      recursive: true,
    });
    const rows = [];
    for (const row of prior.rows.filter((r) =>
      r.captures?.some((c) => c.file),
    )) {
      const copy = { url: row.url, title: row.title, captures: [] };
      for (const c of row.captures.filter((c) => c.file)) {
        if (!/^captures\/[a-z0-9-]+\.png$/.test(c.file))
          throw Error("Invalid comparison capture path");
        const buffer = await readFile(resolve(previousDir, c.file));
        if (hash(buffer) !== c.sha256)
          throw Error("Comparison capture hash mismatch");
        await copyFile(
          resolve(previousDir, c.file),
          resolve(out.dir, "comparison", c.file),
        );
        copy.captures.push({ ...c, file: "comparison/" + c.file });
      }
      rows.push(copy);
    }
    data.comparison = {
      run: prior.run,
      site: prior.site,
      total: prior.rows.length,
      rows,
    };
  }
  data.finishedAt = new Date().toISOString();
  await out.json("inventory.json", {
    version: 1,
    projectId: project.id,
    site,
    run,
    startedAt,
    finishedAt: data.finishedAt,
    coverage: data.coverage,
    captureCoverage: data.captureCoverage,
    pages: data.rows,
  });
  await out.json("results.json", data);
  const inventoryDir = resolve(projectDir, "inventory");
  await mkdir(inventoryDir, { recursive: true });
  const pointerFile = resolve(inventoryDir, `${site.id}.json`),
    pointerTmp = pointerFile + `.${run}.tmp`;
  await writeFile(
    pointerTmp,
    JSON.stringify(
      redact({
        version: 1,
        projectId: project.id,
        site: site.id,
        run,
        state: data.state,
        inventory: `../evidence/${run}/inventory.json`,
        report: `../evidence/${run}/report.html`,
        sha256: hash(await readFile(resolve(out.dir, "inventory.json"))),
        finishedAt: data.finishedAt,
      }),
      null,
      2,
    ) + "\n",
  );
  await rename(pointerTmp, pointerFile);
  await writeInventoryReport(out.dir, data);
  console.log(
    `Report: ${out.dir}/report.html\nInventory ${data.state}: ${data.rows.length} URLs`,
  );
  if (data.state !== "complete") process.exitCode = 2;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    reportError(e, { tool: "inventory", project: process.env.PROJECT });
    process.exitCode = 1;
  });
