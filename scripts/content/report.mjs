import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reportDocument } from "../report.mjs";
import { lead, esc as e, plural } from "../report/lead.mjs";
import { redirectFindings } from "../report/findings.mjs";

export function redirectReport(data) {
  const passed = data.rows.filter((r) => r.status === "pass").length;
  return reportDocument(
    `${data.project.name} — Redirect check`,
    `<main>${lead({
      title: `${data.project.name} — Redirect check`,
      at: data.startedAt,
      checked: `${plural(data.rows.length, "old address", "old addresses")} were requested to see whether each one ends up where the page decisions say it should${/^https?:/.test(data.base) ? `, on ${e(new URL(data.base).host)}` : ""}.`,
      findings: redirectFindings(data),
      quiet: `All ${data.rows.length} addresses end up where the plan says.`,
    })}<section id="results"><h2>Each address</h2><p>${passed} of ${data.rows.length} as planned.</p><div class="scroll" tabindex="0" role="region" aria-label="Redirect results"><table><thead><tr><th>Old address</th><th>Planned</th><th>Result</th><th>What happened</th></tr></thead><tbody>${data.rows.map((r) => `<tr><td>${e(r.source)}</td><td>${r.expectedStatus} ${e(r.expectedDestination)}</td><td>${r.status === "pass" ? "As planned" : `Not as planned: ${e(r.error)}`}</td><td>${e((r.chain || []).map((h) => `${h.status} ${h.url}`).join(" → "))}</td></tr>`).join("")}</tbody></table></div></section><section id="method"><h2>How this was checked</h2><p>Each address is requested once without following links automatically. A page being kept must load; a page being removed must return the planned not-found response; a page being merged must redirect once to the planned address, which must itself load. Loops, chains and redirects to other sites count as failures.</p><details class="internal"><summary>Run record</summary><p>Run ${e(data.run)}, ${e(data.state)}. Request base: ${e(data.base)}. ${data.mapComplete ? "Complete decision map" : "Partial map"}; coverage ${e(JSON.stringify(data.coverage))}. <a href="results.json">Results</a> · <a href="map.json">Checked rules</a> · <a href="conditions.json">Conditions</a></p></details></section></main>`,
    `main{overflow-wrap:anywhere}table{table-layout:fixed;min-width:700px}`,
  );
}
export async function writeRedirectReport(dir, data) {
  await writeFile(resolve(dir, "report.html"), redirectReport(data));
}
