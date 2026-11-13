import { readdirSync, existsSync } from "node:fs";
import { readFile, readdir, stat, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { CliError } from "./errors.mjs";

// The evidence folder is the tool's memory. This module is the only place
// that knows how to name a run, recognise one and find the latest.
export const RUN_NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function nextRunName(projectDir, label, date = new Date()) {
  const prefix = `${date.toISOString().slice(0, 10)}-${label}-`;
  let taken = [];
  try {
    taken = readdirSync(resolve(projectDir, "evidence"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const used = taken
    .filter(
      (n) => n.startsWith(prefix) && /^\d{2,}$/.test(n.slice(prefix.length)),
    )
    .map((n) => Number(n.slice(prefix.length)));
  return prefix + String(Math.max(0, ...used) + 1).padStart(2, "0");
}

export const kinds = {
  inventory: "Inventory",
  "content-review": "Content review",
  "redirect-check": "Redirect check",
  "release-pack": "Release package",
  "release-rehearse": "Release rehearsal",
  "release-reverse": "Release reversal",
  "release-forms": "Form tests",
  "site-check": "Site check",
  maximum: "Investigation",
  watch: "Watch",
  other: "Other files",
};

const ACTED = {
  complete: false,
  partial: true,
  quiet: false,
  changed: true,
  failed: true,
  "baseline-required": true,
  passed: false,
  packaged: false,
  rehearsed: false,
  reversed: false,
  ready: false,
};

async function describe(dir, name) {
  const read = async (file) => {
    try {
      return JSON.parse(await readFile(resolve(dir, file), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
      throw error;
    }
  };
  const base = { name, kind: "other", state: "", finished: false };
  const d = await read("results.json");
  if (!d) {
    const m = await read("manifest.json");
    if (m?.tool === "content-review")
      return {
        ...base,
        kind: "content-review",
        state: "ready",
        finished: true,
        at: m.createdAt,
        site: m.site?.id,
        report: "index.html",
        refs: [m.inventoryRun],
        note: `${m.pages.length} URLs`,
      };
    return base;
  }
  const common = {
    ...base,
    state: d.state || "",
    finished: Boolean(d.finishedAt) && d.state !== "running",
    at: d.finishedAt || d.startedAt,
    report: existsSync(resolve(dir, "report.html")) ? "report.html" : undefined,
  };
  if (d.tool === "watch")
    return {
      ...common,
      kind: "watch",
      site: d.site,
      refs: [d.baseline?.run, d.siteCheck?.run].filter(Boolean),
      note: `${d.rows.length} captures`,
      findings: d.siteCheck?.findings?.length,
    };
  if (d.tool === "inventory")
    return {
      ...common,
      kind: "inventory",
      site: d.site?.id,
      refs: [d.comparison?.run].filter(Boolean),
      note: `${d.rows.length} URLs`,
    };
  if (d.tool === "redirect-check")
    return {
      ...common,
      kind: "redirect-check",
      note: `${d.rows.filter((r) => r.status === "pass").length}/${d.rows.length} rules pass`,
    };
  if (d.tool === "release-kit")
    return {
      ...common,
      kind: `release-${d.action}`,
      state: d.action === "forms" && d.state !== "failed" ? d.state : d.state,
      pin: d.action === "pack" ? d.packageSha256 : d.rehearsal?.journalSha256,
      note: d.package
        ? `${d.package.entries.length} files`
        : d.forms
          ? `${d.forms.rows.filter((r) => r.state === "passed").length}/${d.forms.rows.length} cases pass`
          : "",
    };
  if (d.tool === "site-check-maximum")
    return {
      ...common,
      kind: "maximum",
      site: d.project?.sites?.map((s) => s.id).join(","),
      note: d.question || "",
    };
  if (d.options?.tier && d.results)
    return {
      ...common,
      kind: "site-check",
      tier: d.options.tier,
      site: d.project?.sites?.map((s) => s.id).join(","),
      note: d.options.tier,
    };
  return common;
}

// Reading every results.json is slow on a large job, so summaries are cached
// against the modification time of the file they came from.
export async function listRuns(projectDir) {
  const root = resolve(projectDir, "evidence"),
    cacheFile = resolve(projectDir, ".runs-cache.json");
  let names = [];
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
  let cache = {};
  try {
    cache = JSON.parse(await readFile(cacheFile, "utf8"));
  } catch {}
  let dirty = Object.keys(cache).some((k) => !names.includes(k));
  const runs = await Promise.all(
    names.map(async (name) => {
      const dir = resolve(root, name);
      let stamp = 0;
      for (const f of ["results.json", "manifest.json", "report.html"])
        try {
          stamp += (await stat(resolve(dir, f))).mtimeMs;
        } catch {}
      stamp ||= (await stat(dir)).mtimeMs;
      if (cache[name]?.stamp === stamp) return cache[name].run;
      dirty = true;
      const run = await describe(dir, name);
      run.at ||= new Date((await stat(dir)).mtimeMs).toISOString();
      cache[name] = { stamp, run };
      return run;
    }),
  );
  if (dirty) {
    const kept = Object.fromEntries(names.map((n) => [n, cache[n]]));
    await writeFile(cacheFile + ".tmp", JSON.stringify(kept));
    await rename(cacheFile + ".tmp", cacheFile);
  }
  return runs.sort((a, b) =>
    a.at < b.at ? 1 : a.at > b.at ? -1 : a.name < b.name ? 1 : -1,
  );
}

export const needsAction = (run) => !run.finished || ACTED[run.state] !== false;

export async function latestRun(projectDir, kind, test = () => true) {
  const wanted = [kind].flat();
  return (
    (await listRuns(projectDir)).find(
      (r) => wanted.includes(r.kind) && r.finished && test(r),
    ) || null
  );
}

// Turn "latest" or an omitted value into a real run name, and say which was used.
export async function resolveRun(
  projectDir,
  value,
  kind,
  { purpose, test, quiet } = {},
) {
  const wanted = [kind].flat();
  const label =
    wanted.length > 3
      ? "report"
      : wanted.map((k) => kinds[k].toLowerCase()).join(" or ");
  const id = projectDir.split("/").pop();
  if (value && value !== "latest") {
    if (!RUN_NAME.test(value))
      throw new CliError(
        `${value} is not a run name`,
        `wt status ${id}   (lists the runs that exist)`,
      );
    if (!existsSync(resolve(projectDir, "evidence", value)))
      throw new CliError(
        `No run named ${value} in ${id}`,
        `wt status ${id}   (lists the runs that exist)`,
      );
    return value;
  }
  const run = await latestRun(projectDir, kind, test);
  if (!run)
    throw new CliError(
      `${id} has no finished ${label} run${purpose ? ` to ${purpose}` : ""}`,
      {
        inventory: `wt inventory ${id}`,
        watch: `wt watch ${id}`,
        "release-pack": `wt release ${id} pack`,
        "release-rehearse": `wt release ${id} rehearse`,
        "site-check": `wt site-check ${id}`,
      }[wanted.length === 1 ? wanted[0] : ""] || `wt status ${id}`,
    );
  if (!quiet) console.log(`Using the latest ${label} run: ${run.name}`);
  return run.name;
}
