import { reportDocument, humanDate, humanDuration } from "../report.mjs";
import { lead, list, plural } from "../report/lead.mjs";
import { siteCheckFindings } from "../report/findings.mjs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { aggregatePerformance, cacheState, stats, safeUrl } from "./core.mjs";
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const range = (s, d = 0) =>
  s ? `${number(s.median, d)} (${number(s.min, d)}–${number(s.max, d)})` : "—";
const link = (url, label) =>
  `<a href="${escape(safeUrl(url))}">${escape(label || url)}</a>`;
const raw = (r) =>
  r.raw ? ` <a class="internal" href="${escape(r.raw)}">Evidence</a>` : "";
const field = (f) => {
  const data = f?.page?.metrics ? f.page : f?.origin?.metrics ? f.origin : null;
  if (!data) return "Visitor data unavailable";
  return `${data === f.page && !data.origin_fallback ? "Page" : "Origin"} visitor data: ${Object.entries(
    data.metrics,
  )
    .map(([k, v]) => {
      const labels = {
        LARGEST_CONTENTFUL_PAINT_MS: "Main content loading",
        INTERACTION_TO_NEXT_PAINT: "Response to interaction",
        CUMULATIVE_LAYOUT_SHIFT_SCORE: "Layout movement",
        FIRST_CONTENTFUL_PAINT_MS: "First visible content",
        EXPERIMENTAL_TIME_TO_FIRST_BYTE: "First byte",
      };
      const value =
        k === "CUMULATIVE_LAYOUT_SHIFT_SCORE"
          ? number(v.percentile / 100, 2)
          : `${v.percentile} ms`;
      return `${labels[k] || k}: ${value} (${v.category})`;
    })
    .join("; ")}`;
};
function detail(module, r) {
  if (r.status !== "ok") return escape(r.reason || r.error || r.status);
  const x = r.result;
  if (module === "performance")
    return `Score <strong>${number(x.scores.performance)}</strong>; LCP ${number(Number.isFinite(x.metrics["largest-contentful-paint"]) ? x.metrics["largest-contentful-paint"] / 1000 : NaN, 2)} s; TBT ${number(x.metrics["total-blocking-time"])} ms; CLS ${number(x.metrics["cumulative-layout-shift"], 3)}${x.field ? `<br>${escape(field(x.field))}` : ""}${x.warnings?.length ? `<br>${escape(x.warnings.join("; "))}` : ""}`;
  if (module === "cache")
    return ["plain", "unique-query"]
      .map((mode) => {
        const a = x.filter((v) => v.mode === mode);
        return `${mode}: ${range(stats(a.map((v) => v.ttfbMs)))} ms; ${escape([...new Set(a.map((v) => cacheState(v.headers)))].join(", "))}`;
      })
      .join("<br>");
  if (module === "accessibility")
    return `<strong>${x.violations.length}</strong> automated violations; ${x.incomplete.length} checks need review${x.violations.length ? `<br>${escape(x.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} elements)`).join("; "))}` : ""}${x.keyboard ? `<br>Keyboard: skip link ${escape(x.keyboard.skip.status)}, menu/focus return ${escape(x.keyboard.menu.status)}<br>Visual focus review required` : ""}`;
  if (module === "security")
    return `HTTP → HTTPS: ${x.redirect.https ? "yes" : x.redirect.error ? "request failed" : "no"}; headers to review: ${escape(x.missingHeaders.join(", ") || "none")}<br>${escape(x.forms?.map((f) => `${f.method} ${safeUrl(f.action)}`).join("; ") || "")}`;
  if (module === "discovery")
    return `HTTP ${x.httpStatus}; ${escape(x.title || "No title")}<br>Canonical: ${x.canonicals.map((u) => link(u)).join(", ") || "missing"}<br>Indexing: ${escape(x.indexing.join("; ") || "no restriction reported")}${x.sharingMissing ? `<br>Sharing fields missing: ${escape(x.sharingMissing.join(", ") || "none")}` : ""}${x.links ? `<br>Internal links: ${x.links.checked} checked of ${x.links.total}; ${x.links.broken.length} broken; ${x.links.errors.length} request errors` : ""}${x.sitemap ? `<br>Sitemap membership: ${escape(x.sitemap)}` : ""}`;
  return "";
}
function moduleSummary(module, rows) {
  const values = rows.filter((r) => r.status === "ok").map((r) => r.result);
  if (!values.length) return "No measurements";
  if (module === "performance") {
    const s = stats(values.map((x) => x.scores.performance));
    return s
      ? `Scores ${number(s.min)}–${number(s.max)}`
      : "Scores unavailable";
  }
  if (module === "cache")
    return `Plain median ${range(stats(values.flatMap((x) => x.filter((r) => r.mode === "plain").map((r) => r.ttfbMs))))} ms`;
  if (module === "accessibility")
    return `${values.reduce((n, x) => n + x.violations.length, 0)} automated violations across page/device scans`;
  if (module === "security")
    return `${values.filter((x) => x.missingHeaders.length).length} page/device checks with headers to review`;
  if (module === "discovery")
    return `${values.filter((x) => !x.title || x.canonicals.length !== 1).length} page/device checks with missing titles or non-single canonicals`;
  return "";
}
function cacheGroups(data, project) {
  if (!data.cacheGroups) return "";
  return `<div class="scroll" tabindex="0" role="region" aria-label="Cache timing by state"><table><caption>HTTP timing by reported cache state</caption><thead><tr><th>Site</th><th>Cache state</th><th>Requests</th><th>First byte ms: median (range)</th></tr></thead><tbody>${Object.entries(
    data.cacheGroups,
  )
    .flatMap(([side, groups]) =>
      Object.entries(groups).map(
        ([state, s]) =>
          `<tr><th>${escape(project.labels[side])}</th><td>${escape(state)}</td><td>${s.n}</td><td>${range(s)}</td></tr>`,
      ),
    )
    .join("")}</tbody></table></div>`;
}
function table(module, rows, project) {
  return `<div class="scroll" tabindex="0" role="region" aria-label="${escape(module)} observations"><table class="observations"><caption>${escape(module)} observations</caption><thead><tr><th scope="col">Page / site</th><th scope="col">Device</th><th scope="col">Collection</th><th scope="col">Observations</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${link(r.target.url, r.target.label || r.target.page)}<br><span>${escape(project.labels[r.target.side])}</span></th><td>${escape(r.target.device)}</td><td>${escape(r.status === "ok" ? "collected" : r.status)}</td><td>${detail(module, r)}${raw(r)}</td></tr>`).join("")}</tbody></table></div>`;
}
function performanceTable(rows, project) {
  const groups = aggregatePerformance(rows);
  return `<div class="scroll" tabindex="0" role="region" aria-label="Lighthouse medians and ranges"><table><caption>Lighthouse medians and ranges (median, minimum–maximum)</caption><thead><tr><th>Page / site</th><th>Device</th><th>Runs / 3</th><th>Score</th><th>LCP ms</th><th>TBT ms</th><th>CLS</th></tr></thead><tbody>${groups.map((g) => `<tr><th>${escape(g.target.label)}<br>${escape(project.labels[g.target.side])}</th><td>${escape(g.target.device)}</td><td>${g.runs}</td><td>${range(g.performance)}</td><td>${range(g.metrics["largest-contentful-paint"])}</td><td>${range(g.metrics["total-blocking-time"])}</td><td>${range(g.metrics["cumulative-layout-shift"], 3)}</td></tr>`).join("")}</tbody></table></div>`;
}
export function report(data) {
  const { project, options, results } = data;
  const sections = options.modules
    .map((module) => {
      const rows = results[module] || [];
      const extra =
        module === "performance" && options.tier === "standard"
          ? performanceTable(rows, project) +
            `<details><summary>Cold and repeat browser loads</summary>${(data.browserLoads || []).map((r) => `<p>${escape(r.target.label)} / ${escape(project.labels[r.target.side])} / ${escape(r.target.device)}: ${r.status === "ok" ? r.result.map((l) => `${l.mode}: ${l.requests} requests, ${number(l.transferBytes / 1024, 1)} KiB`).join("; ") : escape(r.error)}${raw(r)}</p>`).join("")}</details>`
          : "";
      const dns =
        module === "security" && data.sites
          ? Object.entries(data.sites)
              .map(([side, s]) =>
                s.security
                  ? `<details><summary>${escape(project.labels[side])}: TLS and email records</summary><p>TLS: ${escape(s.security.tls.status)} ${escape(s.security.tls.protocol || s.security.tls.error || "")}. Email domain: ${escape(s.security.email.domain)}; SPF: ${s.security.email.spf.records.length} records; DMARC: ${escape(s.security.email.dmarc.status)}; MX: ${escape(s.security.email.mx.status)}.</p><p>${escape(s.security.email.method)} DKIM: ${escape(s.security.email.dkim.reason)}</p></details>`
                  : "",
              )
              .join("")
          : "";
      const observations = table(module, rows, project);
      const body =
        options.tier === "minimal" || module === "performance"
          ? `<details><summary>Show ${escape(module)} observations and evidence</summary>${observations}</details>`
          : observations;
      return `<section id="${module}"><h2>${escape(module[0].toUpperCase() + module.slice(1))}</h2>${module === "cache" && options.tier === "standard" ? cacheGroups(data, project) : ""}${extra}${body}${dns}</section>`;
    })
    .join("");
  const missing = data.preflight.filter((r) => r.status !== "ok");
  const cards = (
    project.sites ||
    ["before", "after"].map((id) => ({ id, baseUrl: project[`${id}Base`] }))
  )
    .map(
      ({ id: side, baseUrl }) =>
        `<article><h2>${escape(project.labels[side])}</h2>${link(baseUrl)}<ul>${options.modules
          .map((m) => {
            const a = (results[m] || []).filter((r) => r.target.side === side);
            return `<li><a href="#${m}">${escape(m)}</a>: ${escape(moduleSummary(m, a))}</li>`;
          })
          .join("")}</ul></article>`,
    )
    .join("");
  const sites =
      project.sites ||
      ["before", "after"].map((id) => ({ id, baseUrl: project[`${id}Base`] })),
    targets = data.preflight.map((r) => r.target),
    pages = new Set(targets.map((t) => t.page)).size,
    devices = [...new Set(targets.map((t) => t.device))],
    plain = {
      performance: "loading speed",
      cache: "server response times",
      accessibility: "accessibility",
      security: "security settings",
      discovery: "how search engines and shared links see it",
    };
  const checked = `${plural(pages, "page")} of ${list(sites.map((s) => `${sites.length > 1 ? escape(project.labels[s.id]) + " (" : ""}${link(s.baseUrl, new URL(s.baseUrl).host)}${sites.length > 1 ? ")" : ""}`))}, on ${list(devices.map(escape))}, for ${list(options.modules.map((m) => plain[m] || m))}.`;
  const accounting = options.modules
    .map((m) => {
      const a = results[m] || [];
      return `${m}: ${a.filter((r) => r.status === "ok").length} of ${a.length} collected`;
    })
    .join("; ");
  return reportDocument(
    `${project.name} — Site check`,
    `<main>${lead({ title: `${project.name} — Site check`, at: data.startedAt, checked, findings: siteCheckFindings(data), devices, notes: data.notices || [] })}<section><h2>By area</h2><div class="cards${sites.length === 1 ? " single" : ""}">${cards}</div></section><div id="results">${sections}</div><section id="method"><h2>How this was measured</h2><p>${escape(options.tier[0].toUpperCase() + options.tier.slice(1))} check, ${escape(humanDuration(data.durationMs))}. ${escape(accounting)}.</p>${missing.length ? `<p>${missing.length} page and device combinations could not be checked:</p><ul>${missing.map((r) => `<li>${escape(project.labels[r.target.side])} / ${escape(r.target.label)} / ${escape(r.target.device)}: ${escape(r.error)}</li>`).join("")}</ul>` : ""}${data.failure ? `<p>Collection stopped: ${escape(data.failure)}</p>` : ""}<p>Only public pages were read. Availability checks require a successful response and a visible main heading. Failed pages are skipped, never scored as healthy. Collection success means measurements were saved; review the observations for site problems.</p><p>${options.tier === "minimal" ? "Performance uses one Google PageSpeed Insights request per available page and device; its viewport and throttling are Google’s presets, not the capture viewport. Visitor measurements, when returned, describe a historical 28-day period and may cover the whole origin." : "Performance uses three serial Lighthouse audits per available page and device, with site order rotated each repetition. Each audit uses a new browser and context, the project viewport and recorded simulated network/CPU settings. Medians and ranges describe this session. Cold and repeat browser loads use the host connection without imposed throttling; cold means browser state, not an origin/CDN cache reset."}</p><p>Cache: two plain requests and two unique-query requests per URL, without cookies; times include connection setup and redirects. A query string does not guarantee cache bypass: cache state comes from response headers. HTTP requests are device-independent. ${options.tier === "standard" ? "Sitemap work is bounded to six XML documents and twelve evenly distributed sample URLs per site; discovery checks at most fifty internal links per page. Coverage is recorded in results.json." : "Checks cover the project’s listed pages."}</p><p>Accessibility uses axe WCAG 2 A/AA and 2.1 A/AA rules. ${options.tier === "standard" ? "Keyboard probes test recognised skip links and menu controls; unrecognised interactions and visual focus require review." : ""} Header presence and DNS records are observations, not a security certification. No forms were submitted.</p><details class="internal"><summary>Run record</summary><p><a href="conditions.json">Versions and conditions</a> · <a href="results.json">All results and coverage</a>. Rebuild this report from saved JSON without measuring again.</p></details></section></main>`,
  );
}
export async function writeReport(dir, data) {
  await writeFile(resolve(dir, "report.html"), report(data));
}
