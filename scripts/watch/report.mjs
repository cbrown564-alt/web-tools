import { reportDocument, humanDate } from "../report.mjs";
import { lead, list, plural } from "../report/lead.mjs";
import { watchFindings, findingType } from "../report/findings.mjs";
import { describe } from "../report/wording.mjs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { safeUrl, redact } from "../site-check/core.mjs";
const e = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function rowCard(row) {
  const image = (file, label) =>
    file
      ? `<figure><figcaption>${e(label)} · <a href="${e(file)}">Open full capture</a></figcaption><div class="capture" tabindex="0" role="region" aria-label="${e(row.target.label + " " + label)}"><img src="${e(file)}" alt="${e(row.target.label + " " + row.target.device + " " + label)}"></div></figure>`
      : "";
  return `<article><h3>${e(row.target.label)} / ${e(row.target.device)}</h3><p><a href="${e(safeUrl(row.target.url))}">${e(safeUrl(row.target.url))}</a></p>${row.status === "error" ? `<p class="notice">Capture failed: ${e(row.error)}</p>` : ""}<ul>${row.assertions
    .filter((a) => a.status === "fail")
    .map(
      (a) =>
        `<li>${e(describe(`watch:assertion-${a.type}`).say)}. <span class="internal">${e(a.id)}: ${e(a.reason)}</span></li>`,
    )
    .join(
      "",
    )}</ul>${row.diff ? `<p>${row.diff.changedRatio ? `${row.diff.changedRatio < 0.0001 ? "Less than 0.01" : (row.diff.changedRatio * 100).toFixed(2)}% of the page differs` : "No difference"}${row.diff.dimensionsChanged ? "; the page is a different length" : ""}. ${row.diff.file ? `<a href="${e(row.diff.file)}">Picture of the differences</a>` : ""}</p>` : ""}<div class="captures">${image(row.baselineFile, "Accepted version")}${image(row.capture?.file, "Now")}</div></article>`;
}
export function watchReport(data) {
  const needsReview = (r) =>
    r.status === "error" ||
    r.assertions.some((a) => a.status === "fail") ||
    r.diff?.changed ||
    !r.diff;
  const changed = data.rows.filter(needsReview),
    small = data.rows.filter((r) => !needsReview(r) && r.diff.changedRatio > 0),
    devices = [...new Set(data.rows.map((r) => r.target.device))],
    pages = new Set(data.rows.map((r) => r.target.page)).size,
    host = data.rows[0] ? new URL(data.rows[0].target.url).host : data.site,
    accepted = data.baseline?.acceptedAt
      ? `the version accepted on ${humanDate(data.baseline.acceptedAt)}`
      : "",
    quiet = data.state === "quiet";
  const checked = `${plural(pages, "page")} of ${e(host)} on ${list(devices.map(e))}${accepted && !data.baselineProblem ? `, compared with ${e(accepted)}` : ""}. ${data.siteCheck?.report ? "Accessibility, security settings and search visibility were checked alongside." : ""}`;
  const changes = (data.siteCheckChanges || []).map((c) => {
    const [, kind, text] = /^(New|Resolved): (.+)$/.exec(c) || [, "", c],
      f = findingType(text);
    return `<li>${e(kind === "New" ? "New" : "Gone")}: ${e(describe(f.type).say)} (${e(f.page)}${f.device ? ", " + e(f.device) : ""})</li>`;
  });
  const accept = `wt watch ${data.project.id} accept --run ${data.run}`;
  return reportDocument(
    `${data.project.name} — Watch`,
    `<main>${lead({
      title: `${data.project.name} — Watch`,
      at: data.startedAt,
      checked,
      findings: watchFindings(data),
      devices,
      quiet: quiet
        ? `Nothing changed${accepted ? ` since ${accepted}` : ""}.`
        : "Nothing that needs attention.",
      notes: data.baselineProblem
        ? [
            "What is watched has changed since the last accepted version, so this run starts a new comparison.",
          ]
        : [],
    })}${changed.length ? `<section id="results"><h2>Pages to look at</h2>${changed.map(rowCard).join("")}</section>` : '<div id="results"></div>'}<section id="site-check"><h2>Accessibility, security and search</h2><p>${data.siteCheck?.report ? `<a href="${e(data.siteCheck.report)}">Open the site check</a>` : e(data.siteCheck?.reason || "Not run")}. ${data.siteCheck?.error ? e(data.siteCheck.error) : ""}</p>${changes.length ? `<ul>${changes.join("")}</ul>` : data.baseline && data.siteCheck?.report ? "<p>Same findings as the accepted version.</p>" : ""}</section>${small.length ? `<section id="small"><details><summary>Very small differences that need no review (${small.length})</summary>${small.map(rowCard).join("")}</details></section>` : ""}<details><summary>All captures (${data.rows.length})</summary>${data.rows.map(rowCard).join("")}</details><details class="operator accept"><summary>For the operator: accept this run</summary><p>After review, this makes the run the version later checks compare against. Runs with failures cannot be accepted. Earlier runs are kept.</p><pre>${e(accept)}</pre></details><section id="method"><h2>How this was checked</h2><p>${data.rows.length} full-page captures; ${data.rows.filter((r) => r.status === "error").length} failed; ${data.rows.reduce((n, r) => n + r.assertions.filter((a) => a.status === "fail").length, 0)} of ${data.rows.reduce((n, r) => n + r.assertions.length, 0)} page expectations failed.</p><p>Each capture scrolls through the whole page and waits for images and fonts. A page that is too long or never settles is reported as a failure. Animations are switched off. Areas left out of the comparison: ${e(data.policy.masks.join(", ") || "none")}.</p><p>A page is flagged when more than ${data.policy.maxChangedRatio * 100}% of it differs or its length changes. Rendering fuzz on edges is ignored. Loading-speed scores vary run to run and are not compared.</p>${data.baselineProblem ? `<p>${e(data.baselineProblem)}</p>` : ""}<details class="internal"><summary>Run record</summary><p>Run ${e(data.run)}; compared with ${e(data.baseline?.run || "no accepted run")}. Colour threshold ${data.policy.pixelThreshold}. <a href="results.json">All results</a> · <a href="conditions.json">Conditions and versions</a>. Captures record their address, viewport, time and SHA-256.</p></details></section></main>`,
    `article{margin:16px 0}.captures{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{min-width:0;margin:0}figcaption{margin-bottom:8px}.capture{height:520px;overflow:auto;background:#eee;border:1px solid #aaa}.capture img{display:block;width:100%;height:auto}.capture:focus-visible{outline:3px solid #075db3;outline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f3f3;padding:12px}@media(max-width:650px){.captures{grid-template-columns:1fr}}@media print{section{break-before:auto}.capture{height:auto;overflow:visible}.capture img{max-height:110mm;object-fit:contain;object-position:top}.captures{grid-template-columns:1fr 1fr}article{break-before:page}.accept{display:none}}`,
  );
}
export async function writeWatchReport(dir, data) {
  await writeFile(resolve(dir, "report.html"), watchReport(redact(data)));
}
