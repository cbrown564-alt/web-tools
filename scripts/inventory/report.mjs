import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reportDocument, humanDate } from "../report.mjs";
import { lead, plural } from "../report/lead.mjs";
import { inventoryFindings } from "../report/findings.mjs";
import { redact } from "../site-check/core.mjs";
const e = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function inventoryReport(input) {
  const d = redact(input),
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
  const table = `<div class="scroll" tabindex="0" role="region" aria-label="Page inventory"><table id="inventory-table"><caption>${d.rows.length} URLs collected</caption><thead><tr><th>URL / title</th><th>Status / redirects</th><th>Template</th><th>HTML size</th><th>Captures / probe</th></tr></thead><tbody>${d.rows.map((r, i) => `<tr><td><a href="${e(r.url)}">${e(r.url)}</a><br>${e(r.title)}${r.error ? `<p class="notice">${e(r.error)}</p>` : ""}${r.canonicals?.length ? `<details><summary>Canonical</summary>${r.canonicals.map(e).join("<br>")}</details>` : ""}</td><td>${e(r.status || r.collection)}<br>${r.chain?.length > 1 ? `${r.chain.length - 1} redirects → ${e(r.finalUrl)}` : ""}</td><td>${e(r.template?.group)}<br>${e(r.template?.basis)}</td><td>${r.decodedBytes ?? "—"} bytes</td><td>${(r.captures || []).map((c) => (c.file ? `<a href="${e(c.file)}">${e(c.device)} capture</a>` : `${e(c.device)}: ${e(c.error)}`)).join("<br>")}<details><summary>Technical observations</summary><p>${e(JSON.stringify(r.probe || {}))}</p><a class="internal" href="inventory.json">Machine-readable inventory</a></details></td></tr>`).join("")}</tbody></table></div>`;
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
    })}<section id="coverage"><h2>Coverage</h2><p>${d.rows.length} addresses; ${d.coverage.uniqueSitemapUrls} unique sitemap addresses; ${issues.length} with an error. ${captures.filter((c) => c.status === "ok").length} captures saved, ${captures.filter((c) => c.status === "error").length} failed.</p><p>Link depth ${d.options.depth}; maximum ${d.options["max-urls"]} URLs and ${d.options["max-sitemaps"]} sitemap documents. Capture mode: <strong>${e(d.options.captures)}</strong>; ${d.captureCoverage.selectedPages} of ${d.captureCoverage.eligiblePages} successful HTML pages selected on ${e(d.captureCoverage.devices.join(", "))}.</p>${!d.coverage.complete ? '<p class="notice">Collection is incomplete. Review limits, errors and pending URLs in the evidence before using totals.</p>' : ""}<ul>${[...d.coverage.errors, ...d.coverage.limits].map((x) => `<li>${e(x)}</li>`).join("")}</ul><details><summary>Exclusions and sitemap documents</summary><p>${e(JSON.stringify(d.coverage.exclusions))}</p><ul>${d.coverage.documents.map((m) => `<li>${e(m.url)}: ${m.error ? e(m.error) : `${m.count} ${e(m.type)}`}</li>`).join("")}</ul></details></section><section><h2>Template groups</h2><ul>${[...groups].map(([g, rs]) => `<li>${e(g)}: ${rs.length}</li>`).join("")}</ul></section>${reconciliation ? `<section id="history"><h2>Compared with the earlier record</h2><p>${reconciliation.historicalCount} historical URLs; ${reconciliation.currentCount} collected now; ${reconciliation.shared} exact matches; ${reconciliation.added.length} additions; ${reconciliation.absent.length} historical URLs absent from this crawl. <a class="internal" href="reconciliation.json">Full URL differences</a></p><p>${e(reconciliation.note)}</p></section>` : ""}${sheet}${discovery}<section id="inventory"><h2>Pages</h2><label for="page-search">Find a page</label> <input id="page-search" type="search" aria-controls="inventory-table"><p id="shown" role="status">${d.rows.length} URLs shown</p>${table}</section><section><h2>How this was collected</h2><p>Anonymous public GET requests follow same-site redirects, sitemap entries and ordinary HTML links to the configured depth. Robots rules apply. Assets, action links, sensitive and unbounded queries and dated calendar generators are excluded. Browser captures use fresh contexts and full-page image settling; failures remain visible. No form was submitted or cookie prompt accepted.</p><p>HTML size means decoded response bytes, not total page weight. Template groups are inferred from body classes and project URL rules. Platform and tracker markers are observations, not proof of active delivery. Asset versions do not establish installed plugin versions. No user, application, CV or authenticated API was probed.</p><details class="internal"><summary>Run record</summary><p>Run ${e(d.run)}, ${e(d.state)}. <a href="inventory.json">Inventory JSON</a> · <a href="results.json">Run and coverage</a> · <a href="conditions.json">Conditions and collector</a>. This report can be rebuilt offline.</p></details></section></main><script>const search=document.querySelector('#page-search'),rows=[...document.querySelectorAll('#inventory-table tbody tr')];search.addEventListener('input',()=>{let count=0;for(const r of rows){r.hidden=!r.textContent.toLowerCase().includes(search.value.toLowerCase());if(!r.hidden)count++;}document.querySelector('#shown').textContent=count+' URLs shown';});</script>`,
    `main{overflow-wrap:anywhere}.scroll{max-width:100%}table{table-layout:fixed;min-width:900px}th:first-child{width:30%}details p{white-space:pre-wrap}@media print{section{break-before:auto}}`,
  );
}
export async function writeInventoryReport(dir, data) {
  await writeFile(resolve(dir, "report.html"), inventoryReport(data));
}
