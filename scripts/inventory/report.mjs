import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reportDocument, humanDate } from "../report.mjs";
import { lead, plural } from "../report/lead.mjs";
import { inventoryFindings } from "../report/findings.mjs";
import { redact } from "../site-check/core.mjs";
import { scopeReconciliation } from "./core.mjs";
const e = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function inventoryReport(input) {
  const raw = redact(input),
    d = {
      ...raw,
      reconciliation: scopeReconciliation(
        raw.reconciliation,
        raw.site?.baseUrl,
      ),
    },
    groups = new Map();
  for (const r of d.rows) {
    const name = r.template?.group || "No HTML";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(r);
  }
  const issues = d.rows.filter((r) => r.collection !== "ok" || r.status >= 400),
    captures = d.rows.flatMap((r) => r.captures || []),
    reconciliation = d.reconciliation;
  const signals = new Map();
  for (const r of d.rows)
    for (const kind of ["platform", "plugins", "themes", "trackers"])
      for (const v of r.probe?.[kind] || []) {
        const key = kind + ": " + v.name;
        const item = signals.get(key) || { pages: 0, versions: new Set() };
        item.pages++;
        for (const version of v.assetVersions || []) item.versions.add(version);
        signals.set(key, item);
      }
  const discovery = `<section><h2>Technical discovery</h2><p>${d.rows.reduce((n, r) => n + (r.probe?.forms.length || 0), 0)} form occurrences in collected HTML; no values retained and no submissions made.</p><ul>${[...signals].map(([name, v]) => `<li>${e(name)}: ${v.pages} pages${v.versions.size ? `; asset versions ${e([...v.versions].join(", "))}` : ""}</li>`).join("")}</ul></section>`;
  const host = (() => {
      try {
        return new URL(d.site.baseUrl).host;
      } catch {
        return "";
      }
    })(),
    short = (url) => {
      try {
        const u = new URL(url);
        return u.host === host ? `${u.pathname}${u.search}` : url;
      } catch {
        return url ?? "";
      }
    },
    code = (status) =>
      `<span class="code${status >= 400 || !Number.isFinite(+status) ? " bad" : status >= 300 ? " moved" : ""}">${e(status)}</span>`,
    kb = (n) =>
      Number.isFinite(n) ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : "—";
  const sorted = [...groups].sort((a, b) => b[1].length - a[1].length),
    most = Math.max(1, ...sorted.map(([, rs]) => rs.length));
  const groupBars = `<table class="groups"><thead><tr><th>Template</th><th class="num">Pages</th><th><span class="sr">Share</span></th></tr></thead><tbody>${sorted
    .map(
      ([g, rs]) =>
        `<tr><td>${e(g)}</td><td class="num">${rs.length}</td><td class="barcell"><span class="gbar" style="width:${((rs.length / most) * 100).toFixed(1)}%"></span></td></tr>`,
    )
    .join("")}</tbody></table>`;
  const table = `<div class="scroll" tabindex="0" role="region" aria-label="Page inventory"><table id="inventory-table"><caption>${d.rows.length} URLs collected${host ? `, on ${e(host)} unless shown in full` : ""}</caption><thead><tr><th>Page</th><th>Status</th><th>Template</th><th class="num">HTML size</th><th>Captures / probe</th></tr></thead><tbody>${d.rows.map((r, i) => `<tr><td><a class="path" href="${e(r.url)}">${e(short(r.url))}</a><span class="title">${e(r.title)}</span>${r.error ? `<p class="notice">${e(r.error)}</p>` : ""}${r.canonicals?.length ? `<details><summary>Canonical</summary>${r.canonicals.map(e).join("<br>")}</details>` : ""}</td><td>${code(r.status || r.collection)}${r.chain?.length > 1 ? `<span class="title">${plural(r.chain.length - 1, "redirect")} → ${e(short(r.finalUrl))}</span>` : ""}</td><td>${e(r.template?.group)}<span class="title">${e(r.template?.basis)}</span></td><td class="num">${kb(r.decodedBytes)}</td><td>${(r.captures || []).map((c) => (c.file ? `<a href="${e(c.file)}">${e(c.device)} capture</a>` : `${e(c.device)}: ${e(c.error)}`)).join("<br>")}<details><summary>Technical observations</summary><p>${e(JSON.stringify(r.probe || {}))}</p><a class="internal" href="inventory.json">Machine-readable inventory</a></details></td></tr>`).join("")}</tbody></table></div>`;
  const sheet = d.comparison
    ? `<section><h2>Sites side by side</h2><p>Independent inventories and capture selections; rows do not imply equivalent content.</p><div class="cards">${[
        {
          site: d.comparison.site,
          run: d.comparison.run,
          total: d.comparison.total,
          rows: d.comparison.rows,
        },
        {
          site: d.site,
          run: d.run,
          total: d.rows.length,
          rows: d.rows.filter((r) => r.captures?.some((c) => c.file)),
        },
      ]
        .map(
          (side) =>
            `<article><h3>${e(side.site.label)}</h3><p>${e(side.site.baseUrl)} · ${side.total} addresses</p>${side.rows
              .map(
                (r) =>
                  `<details><summary>${e(r.title || r.url)}</summary><p>${e(r.url)}</p>${r.captures
                    .filter((c) => c.file)
                    .map(
                      (c) =>
                        `<figure><figcaption>${e(c.device)}</figcaption><a href="${e(c.file)}"><img loading="lazy" style="max-width:100%;height:auto" src="${e(c.file)}" alt="${e(r.title || r.url)} ${e(c.device)}"></a></figure>`,
                    )
                    .join("")}</details>`,
              )
              .join("")}</article>`,
        )
        .join("")}</div></section>`
    : "";
  return reportDocument(
    `${d.project.name} — Page inventory`,
    `<main>${lead({
      title: `${d.project.name} — Page inventory`,
      at: d.startedAt,
      checked: `Every page that could be found on ${e(d.site.label)} (<a href="${e(d.site.baseUrl)}">${e(new URL(d.site.baseUrl).host)}</a>) by reading its sitemap and following its links: ${plural(d.rows.length, "address", "addresses")} found, ${plural(new Set(d.rows.filter((r) => r.captures?.some((c) => c.status === "ok")).map((r) => r.url)).size, "page")} pictured.`,
      findings: inventoryFindings(d),
      quiet: "Every address found loads normally.",
      ...(!d.coverage.complete && {
        status: { label: "Partial list", tone: "warn" },
      }),
    })}<section id="coverage"><h2>Coverage</h2><p>${d.rows.length} addresses; ${d.coverage.uniqueSitemapUrls} unique sitemap addresses; ${issues.length} with an error. ${captures.filter((c) => c.status === "ok").length} captures saved, ${captures.filter((c) => c.status === "error").length} failed.</p><p>Link depth ${d.options.depth}; maximum ${d.options["max-urls"]} URLs and ${d.options["max-sitemaps"]} sitemap documents. Capture mode: <strong>${e(d.options.captures)}</strong>; ${d.captureCoverage.selectedPages} of ${d.captureCoverage.eligiblePages} successful HTML pages selected on ${e(d.captureCoverage.devices.join(", "))}.</p>${!d.coverage.complete ? '<p class="notice">Collection is incomplete. Review limits, errors and pending URLs in the evidence before using totals.</p>' : ""}<ul>${[...d.coverage.errors, ...d.coverage.limits].map((x) => `<li>${e(x)}</li>`).join("")}</ul><details><summary>Exclusions and sitemap documents</summary><p>${e(JSON.stringify(d.coverage.exclusions))}</p><ul>${d.coverage.documents.map((m) => `<li>${e(m.url)}: ${m.error ? e(m.error) : `${m.count} ${e(m.type)}`}</li>`).join("")}</ul></details></section><section><h2>Template groups</h2>${groupBars}</section>${reconciliation ? `<section id="history"><h2>${reconciliation.compared ? "Compared with the earlier record" : "Earlier record"}</h2>${reconciliation.compared ? `<p>${reconciliation.historicalCount} historical URLs; ${reconciliation.currentCount} collected now; ${reconciliation.shared} exact matches; ${reconciliation.added.length} additions; ${reconciliation.absent.length} historical URLs absent from this crawl. <a class="internal" href="reconciliation.json">Full URL differences</a></p>` : ""}<p>${e(reconciliation.note)}</p></section>` : ""}${sheet}${discovery}<section id="inventory"><h2>Pages</h2><label for="page-search">Find a page</label> <input id="page-search" type="search" aria-controls="inventory-table"><p id="shown" role="status">${d.rows.length} URLs shown</p>${table}</section><section><h2>How this was collected</h2><p>Anonymous public GET requests follow same-site redirects, sitemap entries and ordinary HTML links to the configured depth. Robots rules apply. Assets, action links, sensitive and unbounded queries and dated calendar generators are excluded. Browser captures use fresh contexts and full-page image settling; failures remain visible. No form was submitted or cookie prompt accepted.</p><p>HTML size means decoded response bytes, not total page weight. Template groups are inferred from body classes and project URL rules. Platform and tracker markers are observations, not proof of active delivery. Asset versions do not establish installed plugin versions. No user, application, CV or authenticated API was probed.</p><details class="internal"><summary>Run record</summary><p>Run ${e(d.run)}, ${e(d.state)}. <a href="inventory.json">Inventory JSON</a> · <a href="results.json">Run and coverage</a> · <a href="conditions.json">Conditions and collector</a>. This report can be rebuilt offline.</p></details></section></main><script>const search=document.querySelector('#page-search'),rows=[...document.querySelectorAll('#inventory-table tbody tr')];search.addEventListener('input',()=>{let count=0;for(const r of rows){r.hidden=!r.textContent.toLowerCase().includes(search.value.toLowerCase());if(!r.hidden)count++;}document.querySelector('#shown').textContent=count+' URLs shown';});</script>`,
    `main{overflow-wrap:anywhere}.scroll{max-width:100%}#inventory-table{table-layout:fixed;min-width:900px}#inventory-table th:first-child{width:34%}#inventory-table th:nth-child(2){width:12%}#inventory-table th:nth-child(4){width:9%}details p{white-space:pre-wrap}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.title{display:block;color:#555;font-size:13px;margin-top:2px}
.code{display:inline-block;font-weight:600;padding:0 4px;border-radius:3px;background:#e8f3ec;color:#1c6b3a}.code.moved{background:#fdf3e1;color:#7a4b00}.code.bad{background:#fbe9e7;color:#9b1c1c}
.groups{max-width:760px;table-layout:auto}.groups td,.groups th{padding:5px 10px}.groups td:first-child{white-space:nowrap}.groups td:last-child{min-width:0;width:55%}
.barcell{vertical-align:middle}.gbar{display:block;height:10px;background:#4a6fa5;border-radius:2px;min-width:2px}
@media print{section{break-before:auto}.gbar,.code{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`,
  );
}
export async function writeInventoryReport(dir, data) {
  await writeFile(resolve(dir, "report.html"), inventoryReport(data));
}
