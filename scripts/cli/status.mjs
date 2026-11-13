import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { validateSiteCheckProject } from "../site-check/core.mjs";
import { reportDocument, humanDate, ago } from "../report.mjs";
import { listRuns, kinds, needsAction } from "./runs.mjs";

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function projectIds() {
  try {
    return (await readdir("projects", { withFileTypes: true }))
      .filter(
        (e) =>
          e.isDirectory() &&
          existsSync(resolve("projects", e.name, "project.json")),
      )
      .map((e) => e.name)
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
async function pointers(dir, folder) {
  const out = [];
  try {
    for (const file of await readdir(resolve(dir, folder)))
      if (file.endsWith(".json"))
        out.push(JSON.parse(await readFile(resolve(dir, folder, file))));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return out;
}
const stateWords = {
  complete: "complete",
  partial: "partial",
  quiet: "no changes",
  changed: "changes to review",
  failed: "failed",
  "baseline-required": "needs a baseline",
  passed: "passed",
  packaged: "packaged",
  rehearsed: "rehearsed",
  reversed: "reversed",
  ready: "ready to review",
  running: "did not finish",
};
export const stateWord = (run) =>
  run.finished
    ? stateWords[run.state] || run.state || "saved"
    : run.kind === "other"
      ? "files"
      : "did not finish";

// The job moves in stages. The next step follows the stage most recently finished.
const STAGES = [
  "inventory",
  "content-review",
  "redirect-check",
  "release-pack",
  "release-rehearse",
  "release-forms",
  "site-check",
  "watch",
];
export async function projectStatus(id) {
  const dir = resolve("projects", id);
  const project = validateSiteCheckProject(
    JSON.parse(await readFile(resolve(dir, "project.json"), "utf8")),
  );
  const runs = await listRuns(dir);
  const names = new Set(runs.map((r) => r.name));
  // A watch's own site check is part of that watch, not a separate stage.
  const child = (r) =>
    r.name.endsWith("-check") && names.has(r.name.slice(0, -6));
  const staged = runs.filter((r) => STAGES.includes(r.kind) && !child(r));
  const latest = Object.fromEntries(
    Object.keys(kinds)
      .filter((k) => k !== "other")
      .map((k) => [k, runs.find((r) => r.kind === k && !child(r))])
      .filter(([, r]) => r),
  );
  const baselines = await pointers(dir, "watch");
  const hasRelease = existsSync(resolve(dir, "release.json"));
  const migration = Boolean(project.inventory) || Boolean(latest.inventory);
  const paired = project.sites.length > 1;
  const watchSite =
    latest.watch?.site || project.watch?.site || (paired ? "after" : undefined);
  const site = (s) => (paired && s ? ` --site ${s}` : "");
  const command = {
    inventory: `wt inventory ${id}`,
    "content-review": `wt content ${id}`,
    "redirect-check": `Decide the pages in the review, export the redirect map, then: wt content ${id} check --map <downloaded-map.json>`,
    "release-pack": `wt release ${id} pack`,
    "release-rehearse": `wt release ${id} rehearse`,
    "release-forms": `wt release ${id} forms`,
    "site-check": `wt site-check ${id}`,
    watch: `wt watch ${id}${site(watchSite)}`,
  };
  const applies = (kind) =>
    kind.startsWith("release-")
      ? hasRelease
      : ["inventory", "content-review", "redirect-check"].includes(kind)
        ? migration
        : true;
  const order = STAGES.filter(applies);
  const last = staged[0];
  let next, why;
  if (!last) {
    next = command[order[0]];
    why = "Nothing has been run yet";
  } else if (!last.finished) {
    next = command[last.kind];
    why = `${last.name} did not finish`;
  } else if (last.kind === "watch") {
    const accepted = baselines.some((b) => b.run === last.name);
    const report = `projects/${id}/evidence/${last.name}/report.html`;
    if (last.state === "baseline-required") {
      next = `Review ${report}, then: wt watch ${id}${site(last.site)} accept`;
      why = "The first watch run needs accepting as the baseline";
    } else if (last.state === "changed" && !accepted) {
      next = `Review ${report}. If the changes are intended: wt watch ${id}${site(last.site)} accept`;
      why = "The watch found changes";
    } else if (last.state === "failed") {
      next = `Read ${report}, fix the cause, then: ${command.watch}`;
      why = "The watch could not complete a check";
    } else {
      next = command.watch;
      why = accepted
        ? "Baseline accepted. Nothing is pending; this is the routine check"
        : "Nothing changed. Nothing is pending; this is the routine check";
    }
  } else if (last.kind === "redirect-check" && last.state !== "passed") {
    next = `Open projects/${id}/evidence/${last.name}/report.html, fix the failing routes, then check the map again`;
    why = "The redirect check has failures";
  } else {
    const after = order[order.indexOf(last.kind) + 1];
    next = command[after] || command.watch;
    why = `${kinds[last.kind]} is done`;
  }
  const attention = Object.values(latest)
    .filter(
      (r) =>
        needsAction(r) &&
        !(r.kind === "watch" && baselines.some((b) => b.run === r.name)),
    )
    .map((r) => `${kinds[r.kind]}: ${stateWord(r)} (${r.name})`);
  return { id, project, runs, latest, baselines, attention, next, why };
}

export function statusText(s) {
  const width = Math.max(...Object.values(kinds).map((k) => k.length)) + 2;
  const lines = [
    `${s.project.name}  (${s.id}; ${s.project.sites.map((x) => x.id).join(", ")})`,
    "",
  ];
  for (const [kind, run] of Object.entries(s.latest))
    lines.push(
      `  ${kinds[kind].padEnd(width)}${stateWord(run).padEnd(20)}${ago(run.at).padEnd(16)}${run.name}`,
    );
  if (!Object.keys(s.latest).length) lines.push("  No runs yet.");
  for (const b of s.baselines)
    lines.push(
      `  ${`Baseline (${b.site})`.padEnd(width)}${"accepted".padEnd(20)}${ago(b.acceptedAt).padEnd(16)}${b.run}`,
    );
  lines.push("");
  if (s.attention.length)
    lines.push("Needs attention:", ...s.attention.map((a) => `  ${a}`), "");
  lines.push(`${s.why}.`, `Next: ${s.next}`);
  return lines.join("\n");
}

// The operator's home page for a job: every report, newest first.
export async function writeIndex(id) {
  const s = await projectStatus(id);
  const rows = s.runs
    .map((r) => {
      const label = `${kinds[r.kind]}${r.site ? ` · ${r.site}` : ""}${r.note ? ` · ${r.note}` : ""}`;
      return `<tr><td>${esc(humanDate(r.at))}</td><td>${esc(label)}</td><td>${esc(stateWord(r))}</td><td>${r.report ? `<a href="evidence/${esc(r.name)}/${esc(r.report)}">Open report</a>` : ""}</td><td><a href="evidence/${esc(r.name)}/">${esc(r.name)}</a></td></tr>`;
    })
    .join("");
  const file = resolve("projects", id, "index.html");
  await writeFile(
    file,
    reportDocument(
      `${s.project.name} — Reports`,
      `<main><h1>${esc(s.project.name)} — Reports</h1><p>${s.project.sites.map((x) => `<a href="${esc(x.baseUrl)}">${esc(x.label)}</a>`).join(" · ")}</p><section><h2>Where this stands</h2><p>${esc(s.why)}.</p><p><strong>Next:</strong> <code>${esc(s.next)}</code></p>${s.attention.length ? `<ul>${s.attention.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}${s.baselines.map((b) => `<p>Watch baseline for ${esc(b.site)}: accepted ${esc(humanDate(b.acceptedAt))}. <a href="evidence/${esc(b.run)}/report.html">Open it</a></p>`).join("")}</section><section><h2>Every run, newest first</h2><div class="scroll" tabindex="0" role="region" aria-label="Runs"><table><thead><tr><th>When</th><th>What</th><th>State</th><th>Report</th><th>Folder</th></tr></thead><tbody>${rows || `<tr><td colspan="5">No runs yet.</td></tr>`}</tbody></table></div></section><footer>Built ${esc(humanDate(new Date().toISOString()))}. Rebuild with <code>wt index ${esc(s.id)}</code>.</footer></main>`,
      `code{background:#f3f3f3;padding:2px 4px;overflow-wrap:anywhere}td:last-child{min-width:0}section{margin:24px 0}`,
    ),
  );
  return { file: `projects/${id}/index.html`, status: s };
}
