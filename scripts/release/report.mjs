import { reportDocument } from "../report.mjs";
import { lead, plural } from "../report/lead.mjs";
import { releaseFindings } from "../report/findings.mjs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { redact } from "../site-check/core.mjs";
const e = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function releaseReport(out, input) {
  const d = redact(input),
    form = d.forms;
  const what = {
    pack: {
      title: "Release package",
      checked: `The ${plural(d.package?.entries.length ?? 0, "file")} that make up this release were gathered into one package and fingerprinted, so that what is tested is exactly what is released.`,
      quiet: "The package was built and its contents match their fingerprints.",
    },
    verify: {
      title: "Release package check",
      checked:
        "The package was compared with the fingerprint recorded when it was built.",
      quiet: "The package is unchanged since it was built.",
    },
    rehearse: {
      title: "Release rehearsal",
      checked:
        "The release was applied to a private copy of the site's files and then undone, to show that both steps work and that nothing else is touched.",
      quiet: "The release applied cleanly and was fully undone.",
    },
    reverse: {
      title: "Release reversal",
      checked: "The rehearsed release was undone again from its saved record.",
      quiet: "Every changed file was returned to its original state.",
    },
    forms: {
      title: "Form tests",
      checked: `Each form was submitted in a private local copy of the site with marked test messages, on each device, to see that messages arrive and that failures are shown to the visitor. ${e(form?.scope || "")}`,
      quiet: "Every test message arrived and was cleaned up afterwards.",
    },
  }[d.action] || { title: "Release kit", checked: e(d.action), quiet: "Done." };
  const html = reportDocument(
    `${d.project.name} — Release kit`,
    `<main>${lead({ title: `${d.project.name} — ${what.title}`, at: d.startedAt, checked: what.checked, findings: releaseFindings(d), quiet: what.quiet })}<div id="detail"></div>${d.recovery ? `<details class="internal"><summary>Recovery record</summary><p>Saved recovery journal SHA-256: <code>${e(d.recovery.journalSha256)}</code>. <a href="journal/journal.json">Journal</a>. Reverse only this run’s disposable target with that pin.</p></details>` : ""}${d.reversal ? `<p>Reversal checked ${d.reversal.rows.length} changed file operations.</p>` : ""}${d.package ? `<section><h2>What is in the package</h2><details><summary>${d.package.entries.length} files and their fingerprints</summary><p>Project ${e(d.package.projectId)} · ${d.package.entries.length} explicit file operations · Manifest SHA-256 <code>${e(d.packageSha256)}</code></p>${d.archive ? `<p class="internal"><a href="package.tar.gz">Download package archive</a> · <a href="package/manifest.json">Fixed manifest</a></p><p>Archive SHA-256: <code>${e(d.archive.sha256)}</code></p>` : ""}<div class="scroll" tabindex="0" role="region" aria-label="Package files"><table><thead><tr><th>Path</th><th>Operation</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>${d.package.entries.map((f) => `<tr><td>${e(f.path)}</td><td>${e(f.operation)}</td><td>${f.bytes ?? "—"}</td><td>${e(f.sha256 || "—")}</td></tr>`).join("")}</tbody></table></div></details></section>` : ""}${d.rehearsal ? `<section><h2>Local apply and reversal</h2><p>Backup restored into a fresh copy: ${d.rehearsal.restore.verified ? "verified" : "failed"} (${d.rehearsal.restore.files} files). Changed operations: ${d.rehearsal.changed}; unchanged: ${d.rehearsal.unchanged}.</p><p>Selective reversal: ${d.rehearsal.reversed ? "verified" : "failed"}. Synthetic incoming file preserved: ${d.rehearsal.incomingPreserved ? "yes" : "no"}. Original file contents and modes restored: ${d.rehearsal.originalsRestored ? "yes" : "no"}.</p><p class="internal"><a href="journal/journal.json">Before/after journal</a> · <a href="${e(d.rehearsal.reversalFile)}">Reversal results</a> · <a href="backup/manifest.json">Backup manifest</a>. This rehearsal changes only its disposable local target.</p></section>` : ""}${form ? `<section id="forms"><h2>Form tests</h2><p>${form.rows.filter((r) => r.state === "passed").length}/${form.rows.length} cases passed. Marker cleanup ${form.cleanupVerified ? "verified" : "incomplete"}; unrelated local record ${form.unrelatedRecordPreserved ? "preserved" : "not verified"}.</p><div class="scroll" tabindex="0" role="region" aria-label="Form test results"><table><thead><tr><th>Device / case</th><th>Result</th><th>Receipt / cleanup</th><th>Evidence</th></tr></thead><tbody>${form.rows.map((r) => `<tr><td>${e(r.device)} / ${e(r.mode)}</td><td>${e(r.state)} ${e(r.error || r.reason)}</td><td>Receipt ${r.state === "not-applicable" ? "N/A" : r.receiptVerified ? "matched" : "not matched"}; cleanup ${r.state === "not-applicable" ? "N/A" : r.cleanupVerified ? "verified" : "failed"}${r.retrySuppressed ? "; delivery found after lost confirmation, retry suppressed" : ""}</td><td>${r.screenshot ? `<a href="${e(r.screenshot)}">Browser capture</a>` : ""}</td></tr>`).join("")}</tbody></table></div><p class="internal"><a href="form-results.json">Receipt, attachment and cleanup evidence</a>. The local capture inbox is not a staff mailbox. Production form delivery remains a separate check.</p></section>` : ""}<section class="operator"><h2>Launch checklist</h2><p>Ten areas remain pending human review. Component rehearsals do not mark an entire launch area passed.</p><p><a href="checklist.md">Checklist</a> · <a href="checklist.json">Editable checklist JSON</a></p></section><footer class="internal"><details><summary>Run record</summary><p>Run state: ${e(d.state)}. <a href="results.json">All run results</a> · <a href="conditions.json">Conditions and source hashes</a>. Package changes use disposable local targets. Form results distinguish synthetic fixtures from explicitly configured isolated local profiles.</p></details></footer></main>`,
    `main{overflow-wrap:anywhere}code{white-space:normal}table{table-layout:fixed;min-width:750px}th:first-child{width:30%}td:last-child{min-width:0}@media print{section{break-before:auto}}`,
  );
  await writeFile(resolve(out, "report.html"), html);
}
