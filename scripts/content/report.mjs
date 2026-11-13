import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reportDocument } from "../report.mjs";
import { lead, esc as e, plural } from "../report/lead.mjs";
import { redirectFindings } from "../report/findings.mjs";

// Addresses on the checked host are shown as paths; anything else in full.
const shorten = (host) => (url) => {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.host === host ? `${u.pathname}${u.search}` : url;
  } catch {
    return url;
  }
};

const why = (error) =>
  String(error ?? "").replace(
    /^Expected initial HTTP (\d+); got (\d+)$/,
    "Answered $2 instead of $1",
  );

export function redirectReport(data) {
  const rows = data.rows,
    passed = rows.filter((r) => r.status === "pass"),
    failed = rows.filter((r) => r.status !== "pass"),
    host = (() => {
      for (const r of rows)
        try {
          return new URL(r.source).host;
        } catch {}
      return "";
    })(),
    short = shorten(host),
    undecided = data.coverage?.undecided || 0;
  const planned = (r) =>
    r.expectedDestination
      ? `${r.expectedStatus} → ${e(short(r.expectedDestination))}`
      : r.expectedStatus >= 400
        ? `${r.expectedStatus}, removed`
        : `${r.expectedStatus}, kept`;
  const hops = (r) =>
    (r.chain || [])
      .map(
        (h, i) =>
          `<span class="hop">${i ? `<span class="arrow" aria-hidden="true">→</span>` : ""}<span class="code${h.status >= 400 ? " bad" : h.status >= 300 ? " moved" : ""}">${e(h.status)}</span> ${e(i ? short(h.url) : "")}</span>`,
      )
      .join("") || e(r.error);
  // A proportion bar: as planned, not as planned and not yet decided.
  const part = (n, cls, label) =>
    n
      ? `<span class="seg ${cls}" style="flex:${n}" title="${e(label)}"></span>`
      : "";
  const bar = `<div class="bar" role="img" aria-label="${passed.length} as planned, ${failed.length} not as planned${undecided ? `, ${undecided} not yet decided` : ""}">${part(passed.length, "ok", "As planned")}${part(failed.length, "bad", "Not as planned")}${part(undecided, "none", "Not yet decided")}</div><p class="legend"><span class="sw ok"></span>${passed.length} as planned <span class="sw bad"></span>${failed.length} not as planned${undecided ? ` <span class="sw none"></span>${undecided} not yet decided, so not checked` : ""}</p>`;
  const failTable = failed.length
    ? `<h3>Not as planned</h3><div class="scroll" tabindex="0" role="region" aria-label="Addresses not as planned"><table class="fails"><thead><tr><th>Old address</th><th>Planned</th><th>What happened</th><th>Why it fails</th></tr></thead><tbody>${failed
        .map(
          (r) =>
            `<tr><td class="path"><a href="${e(r.source)}">${e(short(r.source))}</a></td><td>${planned(r)}</td><td class="chain">${hops(r)}</td><td>${e(why(r.error))}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : "";
  const passTable = passed.length
    ? `<details><summary>${plural(passed.length, "address", "addresses")} as planned</summary><div class="scroll" tabindex="0" role="region" aria-label="Addresses as planned"><table class="passes"><thead><tr><th>Old address</th><th>Planned</th><th>What happened</th></tr></thead><tbody>${passed
        .map(
          (r) =>
            `<tr><td class="path">${e(short(r.source))}</td><td>${planned(r)}</td><td class="chain">${hops(r)}</td></tr>`,
        )
        .join("")}</tbody></table></div></details>`
    : "";
  return reportDocument(
    `${data.project.name} — Redirect check`,
    `<main>${lead({
      title: `${data.project.name} — Redirect check`,
      at: data.startedAt,
      checked: `${plural(rows.length, "old address", "old addresses")} were requested to see whether each one ends up where the page decisions say it should${/^https?:/.test(data.base) ? `, on ${e(new URL(data.base).host)}` : ""}.`,
      findings: redirectFindings(data),
      quiet: `All ${rows.length} addresses end up where the plan says.`,
      status: failed.length
        ? {
            label: `${plural(failed.length, "address", "addresses")} not as planned`,
            tone: "bad",
          }
        : undecided
          ? { label: `${undecided} not yet decided`, tone: "warn" }
          : { label: "All as planned", tone: "ok" },
    })}<section id="results"><h2>Each address</h2>${bar}${host ? `<p class="host">Addresses are on ${e(host)} unless shown in full.</p>` : ""}${failTable}${passTable}</section><section id="method"><h2>How this was checked</h2><p>Each address is requested once without following links automatically. A page being kept must load; a page being removed must return the planned not-found response; a page being merged must redirect once to the planned address, which must itself load. Loops, chains and redirects to other sites count as failures.</p><details class="internal"><summary>Run record</summary><p>Run ${e(data.run)}, ${e(data.state)}. Request base: ${e(data.base)}. ${data.mapComplete ? "Complete decision map" : "Partial map"}; coverage ${e(JSON.stringify(data.coverage))}. <a href="results.json">Results</a> · <a href="map.json">Checked rules</a> · <a href="conditions.json">Conditions</a></p></details></section></main>`,
    `main{overflow-wrap:anywhere}
.bar{display:flex;height:14px;border-radius:3px;overflow:hidden;max-width:900px;margin:8px 0 6px;background:#eee}
.seg{display:block;min-width:3px}.seg.ok{background:#3f7d58}.seg.bad{background:#b42318}.seg.none{background:repeating-linear-gradient(135deg,#fff 0 3px,#cfcfcf 3px 5px)}
.legend{font-size:14px;color:#333;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:-6px}.sw.ok{background:#3f7d58}.sw.bad{background:#b42318}.sw.none{background:repeating-linear-gradient(135deg,#fff 0 2px,#cfcfcf 2px 4px);border:1px solid #ccc}
.host{font-size:13px;color:#555}
h3{font-size:16px;margin:20px 0 6px}
.fails td,.passes td{padding:7px 10px}
.fails td:last-child,.passes td:last-child{min-width:0}
.path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.chain{font-size:13px}
.hop{white-space:normal}.arrow{color:#777;margin:0 6px}
.code{display:inline-block;font-weight:600;font-variant-numeric:tabular-nums;padding:0 4px;border-radius:3px;background:#e8f3ec;color:#1c6b3a}.code.moved{background:#fdf3e1;color:#7a4b00}.code.bad{background:#fbe9e7;color:#9b1c1c}
.fails{table-layout:fixed}.fails th:nth-child(1){width:34%}.fails th:nth-child(2){width:16%}.fails th:nth-child(3){width:28%}
@media(max-width:650px){.fails{table-layout:auto;min-width:640px}}
@media print{.seg,.sw,.code{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`,
  );
}
export async function writeRedirectReport(dir, data) {
  await writeFile(resolve(dir, "report.html"), redirectReport(data));
}
