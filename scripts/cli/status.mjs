import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { validateSiteCheckProject } from "../site-check/core.mjs";
import { reportDocument, humanDate, ago, stateTag } from "../report.mjs";
import { plural } from "../report/lead.mjs";
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

// How each state reads at a glance: done, look at this, failed, or neither.
const TONES = {
  complete: "ok",
  passed: "ok",
  quiet: "ok",
  packaged: "ok",
  rehearsed: "ok",
  reversed: "ok",
  partial: "warn",
  changed: "warn",
  "baseline-required": "warn",
  ready: "warn",
  failed: "bad",
};
const tone = (run) =>
  run.kind === "other"
    ? "muted"
    : !run.finished
      ? "bad"
      : TONES[run.state] || "muted";

// The operator's home page for a job: the latest run of each tool in the
// order the job moves, then every earlier run folded away.
export async function writeIndex(id) {
  const s = await projectStatus(id);
  const report = (r) =>
    r.report
      ? `<a href="evidence/${esc(r.name)}/${esc(r.report)}">Open report</a>`
      : `<a href="evidence/${esc(r.name)}/">Folder</a>`;
  const label = (id) => s.project.sites.find((x) => x.id === id)?.label ?? id;
  const what = (r) =>
    [r.site && String(r.site).split(",").map(label).join(" and "), r.note]
      .filter(Boolean)
      .map(esc)
      .join(" · ");
  const order = [
    ...STAGES,
    ...Object.keys(s.latest).filter((k) => !STAGES.includes(k)),
  ].filter((k) => s.latest[k]);
  const latestRows = order
    .map((kind) => {
      const r = s.latest[kind],
        baseline = s.baselines.find((b) => b.run === r.name);
      return `<tr><th scope="row">${esc(kinds[kind])}</th><td>${stateTag(stateWord(r), tone(r))}${baseline ? ` ${stateTag("accepted as baseline", "ok")}` : ""}</td><td>${esc(what(r))}</td><td><span title="${esc(humanDate(r.at))}">${esc(ago(r.at))}</span></td><td>${report(r)}</td></tr>`;
    })
    .join("");
  const shown = new Set(order.map((k) => s.latest[k].name));
  const earlier = s.runs.filter((r) => !shown.has(r.name));
  const rows = earlier
    .map(
      (r) =>
        `<tr><td>${esc(humanDate(r.at))}</td><td>${esc(kinds[r.kind])}${what(r) ? ` · ${what(r)}` : ""}</td><td>${stateTag(stateWord(r), tone(r))}</td><td>${r.report ? `<a href="evidence/${esc(r.name)}/${esc(r.report)}">Open report</a>` : ""}</td><td><a class="folder" href="evidence/${esc(r.name)}/">${esc(r.name)}</a></td></tr>`,
    )
    .join("");
  const overall = s.attention.length
    ? stateTag(
        plural(s.attention.length, "thing", "things") + " to look at",
        "warn",
      )
    : stateTag("Nothing pending", "ok");
  const file = resolve("projects", id, "index.html");
  await writeFile(
    file,
    reportDocument(
      `${s.project.name} — Reports`,
      `<main><h1>${esc(s.project.name)} — Reports</h1><p class="sites">${s.project.sites.map((x) => `<a href="${esc(x.baseUrl)}">${esc(x.label)}</a>`).join(" · ")}</p><section><h2>Where this stands ${overall}</h2><p>${esc(s.why)}.</p><p class="next"><strong>Next:</strong> <code>${esc(s.next)}</code></p></section><section><h2>Latest of each</h2>${latestRows ? `<div class="scroll" tabindex="0" role="region" aria-label="Latest runs"><table class="latest"><thead><tr><th>Tool</th><th>State</th><th>What</th><th>When</th><th>Report</th></tr></thead><tbody>${latestRows}</tbody></table></div>` : "<p>No runs yet.</p>"}</section>${earlier.length ? `<section><details><summary>Earlier runs (${earlier.length})</summary><div class="scroll" tabindex="0" role="region" aria-label="Earlier runs"><table class="earlier"><thead><tr><th>When</th><th>What</th><th>State</th><th>Report</th><th>Folder</th></tr></thead><tbody>${rows}</tbody></table></div></details></section>` : ""}<footer>Built ${esc(humanDate(new Date().toISOString()))}. Rebuild with <code>wt index ${esc(s.id)}</code>.</footer></main>`,
      `code{background:#f3f3f3;padding:2px 4px;overflow-wrap:anywhere}td:last-child{min-width:0}section{margin:24px 0}h2 .state{margin-left:8px;vertical-align:middle}.sites{margin:6px 0 0}.latest{max-width:1000px}.latest th[scope=row]{font-weight:600;white-space:nowrap}.latest td,.latest th{padding:9px 10px}.earlier{font-size:13px}.earlier td{padding:6px 10px}.folder{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}summary{font-weight:600}@media(max-width:650px){.latest thead{display:none}.latest,.latest tbody{display:block}.latest tr{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:10px 0;border-bottom:1px solid #ddd}.latest td,.latest th{padding:0;border:0}.latest td:empty{display:none}.latest tr>:nth-child(3){flex-basis:100%;font-size:14px}.latest tr>:nth-child(4){font-size:14px;color:#555}.earlier{min-width:620px}}`,
    ),
  );
  return { file: `projects/${id}/index.html`, status: s };
}
