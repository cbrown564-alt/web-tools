import { reportDocument } from "../report.mjs";
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
    .map((a) => `<li>${e(a.id)}: ${e(a.reason)}</li>`)
    .join(
      "",
    )}</ul>${row.diff ? `<p>${(row.diff.changedRatio * 100).toFixed(3)}% changed pixels${row.diff.dimensionsChanged ? "; page dimensions changed" : ""}. <a href="${e(row.diff.file)}">Difference image</a></p>` : ""}<div class="captures">${image(row.baselineFile, "Accepted baseline")}${image(row.capture?.file, "This run")}</div></article>`;
}
export function watchReport(data) {
  const changed = data.rows.filter(
    (r) =>
      r.status === "error" ||
      r.assertions.some((a) => a.status === "fail") ||
      r.diff?.changed ||
      !r.diff,
  );
  const title =
    data.state === "quiet"
      ? "No changes against the accepted baseline"
      : data.state === "baseline-required"
        ? "Baseline required"
        : data.state === "failed"
          ? "Watch found a failure"
          : "Changes to review";
  const accept = `PROJECT=${data.project.id} npm run watch -- accept --run ${data.run}`;
  return reportDocument(
    `${data.project.name} — Post-launch watch`,
    `<main><a href="#results">Skip to results</a><header><h1>${e(data.project.name)} — Post-launch watch</h1><p>${e(data.startedAt)} · ${e(data.site)} · ${e(data.run)}</p><h2>${e(title)}</h2><p>Baseline: ${e(data.baseline?.run || "none")}. ${data.rows.length} page/device captures; ${data.rows.filter((r) => r.status === "error").length} capture failures; ${data.rows.reduce((n, r) => n + r.assertions.filter((a) => a.status === "fail").length, 0)} failed assertions.</p></header>${data.baselineProblem ? `<p class="notice">${e(data.baselineProblem)}</p>` : ""}<section><h2>Minimal site check</h2><p>${data.siteCheck?.report ? `<a href="${e(data.siteCheck.report)}">Open the minimal site-check report</a> · collection ${e(data.siteCheck.state)}` : e(data.siteCheck?.reason || "Not run")}. ${data.siteCheck?.error ? e(data.siteCheck.error) : ""}</p>${data.siteCheckChanges?.length ? `<ul>${data.siteCheckChanges.map((c) => `<li>${e(c)}</li>`).join("")}</ul>` : ""}</section><section id="results"><h2>${changed.length ? "Captures to review" : "No visual or assertion changes"}</h2>${changed.map(rowCard).join("")}</section>${changed.length !== data.rows.length ? `<details><summary>All captures (${data.rows.length})</summary>${data.rows.map(rowCard).join("")}</details>` : ""}<section class="accept"><h2>Accept this run as the baseline</h2><p>After reviewing the report, run the command below. Capture failures, failed assertions, incomplete site checks and stale comparisons cannot be accepted. Previous runs remain unchanged.</p><pre>${e(accept)}</pre></section><section><h2>How this was checked</h2><p>Full-page captures scroll through the document and wait for displayed images and fonts. Oversized or unsettled pages are reported as failures, never accepted as a truncated baseline. CSS animations are disabled; project masks: ${e(data.policy.masks.join(", ") || "none")}.</p><p>Pixel colour threshold ${data.policy.pixelThreshold}; allowed changed pixel ratio ${data.policy.maxChangedRatio}. Anti-alias differences are ignored; a dimension change always requires review. Assertions run on every capture. Site-check comparisons track findings, not fluctuating performance scores.</p><p><a href="results.json">All results</a> · <a href="conditions.json">Conditions and versions</a>. Captures include their URL, viewport, capture time and SHA-256. Baseline acceptance changes a local pointer, not these saved runs.</p></section></main>`,
    `article{margin:16px 0}.captures{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{min-width:0;margin:0}figcaption{margin-bottom:8px}.capture{height:520px;overflow:auto;background:#eee;border:1px solid #aaa}.capture img{display:block;width:100%;height:auto}.capture:focus-visible{outline:3px solid #075db3;outline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f3f3;padding:12px}@media(max-width:650px){.captures{grid-template-columns:1fr}}@media print{section{break-before:auto}.capture{height:auto;overflow:visible}.capture img{max-height:110mm;object-fit:contain;object-position:top}.captures{grid-template-columns:1fr 1fr}article{break-before:page}.accept{display:none}}`,
  );
}
export async function writeWatchReport(dir, data) {
  await writeFile(resolve(dir, "report.html"), watchReport(redact(data)));
}
