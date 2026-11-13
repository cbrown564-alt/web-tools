import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { listRuns } from "./runs.mjs";

// Rebuild a saved report from its results, with no network and no browser.
// Returns the report file, or null for a run that has no rebuildable report.
export async function renderDir(dir, kind) {
  const read = async (file) =>
    JSON.parse(await readFile(resolve(dir, file), "utf8"));
  if (kind === "site-check") {
    const { writeReport } = await import("../site-check/report.mjs");
    await writeReport(dir, await read("results.json"));
  } else if (kind === "maximum") {
    const { writeMaximumReport } =
      await import("../site-check/maximum-report.mjs");
    await writeMaximumReport(dir, await read("results.json"));
  } else if (kind === "watch") {
    const { writeWatchReport } = await import("../watch/report.mjs");
    await writeWatchReport(dir, await read("results.json"));
    if (existsSync(resolve(dir, "site-check", "results.json")))
      await renderDir(resolve(dir, "site-check"), "site-check");
  } else if (kind === "inventory") {
    const { writeInventoryReport } = await import("../inventory/report.mjs");
    await writeInventoryReport(dir, await read("results.json"));
  } else if (kind === "redirect-check") {
    const { writeRedirectReport } = await import("../content/report.mjs");
    await writeRedirectReport(dir, await read("results.json"));
  } else if (kind.startsWith("release-")) {
    const { releaseReport } = await import("../release/report.mjs");
    await releaseReport(dir, await read("results.json"));
  } else return null;
  return resolve(dir, "report.html");
}

export async function rerenderAll(id) {
  const projectDir = resolve("projects", id),
    runs = await listRuns(projectDir),
    result = { runs: runs.length, rebuilt: 0, kept: 0, failed: [] };
  for (const run of runs) {
    if (!run.finished || !run.report || run.kind === "content-review") {
      result.kept++;
      continue;
    }
    try {
      if (await renderDir(resolve(projectDir, "evidence", run.name), run.kind))
        result.rebuilt++;
      else result.kept++;
    } catch (error) {
      result.failed.push(`${run.name}: ${error.message}`);
    }
  }
  return result;
}
