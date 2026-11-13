// Visual forms for the site check: a findings grid that puts the sites side
// by side, and a loading-time chart on one shared scale. Both are plain HTML
// and CSS so they print, scale and read without script.
import { esc, places, list, plural } from "../report/lead.mjs";
import { aggregatePerformance } from "./core.mjs";

export const sitesOf = (project) =>
  (
    project.sites ||
    ["before", "after"].map((id) => ({ id, baseUrl: project[`${id}Base`] }))
  ).map((s) => ({
    ...s,
    label: project.labels?.[s.id] || s.label || s.id,
    host: new URL(s.baseUrl).host,
  }));

// Pages in the order they were checked, per site, with whether any device
// could be checked at all. An unchecked page is unknown, never clean.
function pagesBySite(data, sites) {
  const out = new Map(sites.map((s) => [s.id, new Map()]));
  for (const r of data.preflight) {
    const t = r.target,
      pages = out.get(t.side);
    if (!pages) continue;
    const label = t.label || t.page;
    if (!pages.has(label)) pages.set(label, { label, checked: false });
    if (r.status === "ok") pages.get(label).checked = true;
  }
  return out;
}

const shortNote = (n) =>
  String(n)
    .replace(/ seconds?$/, " s")
    .replace(/ out of 100$/, "");

// Where a finding sits: { side: { pages: Map(label → {devices, notes}), whole } }
function cellsFor(finding, sites, columns) {
  const bySide = new Map(
      sites.map((s) => [s.id, { pages: new Map(), whole: false }]),
    ),
    byLabel = new Map(sites.map((s) => [s.label, s.id])),
    other = [];
  for (const p of finding.places) {
    if (typeof p === "string") {
      // Site-wide places are a site label or an email domain.
      const side =
        byLabel.get(p) ||
        sites.find((s) => s.host === p || s.host.endsWith(`.${p}`))?.id;
      if (side) bySide.get(side).whole = true;
      else other.push(p);
      continue;
    }
    const side = sites.length === 1 ? sites[0].id : byLabel.get(p.site);
    if (!side) {
      other.push(p.page);
      continue;
    }
    // A place that is not one of the checked pages (a cache probe address,
    // say) is named in words rather than dropped.
    if (columns && !columns.get(side)?.has(p.page)) {
      const site = sites.length > 1 ? `${p.site}: ` : "";
      other.push(`${site}${p.page}${p.note ? ` (${p.note})` : ""}`);
      continue;
    }
    const pages = bySide.get(side).pages;
    if (!pages.has(p.page))
      pages.set(p.page, { devices: new Set(), notes: [] });
    const cell = pages.get(p.page);
    if (p.device) cell.devices.add(p.device);
    else cell.devices.add("*");
    if (p.note && !cell.notes.includes(p.note)) cell.notes.push(p.note);
  }
  return { bySide, other };
}

function mark(cell, devices) {
  const all =
    cell.devices.has("*") || devices.every((d) => cell.devices.has(d));
  const only = all ? "" : [...cell.devices].join(", ");
  const note = cell.notes.map(shortNote).join(", ");
  const title = [note && cell.notes.join(", "), only && `${only} only`]
    .filter(Boolean)
    .join("; ");
  return `<span class="hit${note ? " value" : ""}${only ? " part" : ""}"${title ? ` title="${esc(title)}"` : ""}>${note ? esc(note) : `<span class="dot" aria-hidden="true"></span><span class="sr">Found</span>`}${only ? `<span class="only">${esc(only)}</span>` : ""}</span>`;
}

function row(f, { sites, pages, devices }) {
  const { bySide, other } = cellsFor(f, sites, pages);
  const where = places(f, devices);
  const cells = sites
    .map((s) => {
      const cols = [...pages.get(s.id).values()],
        hits = bySide.get(s.id);
      if (hits.whole && !hits.pages.size)
        return `<td class="cell whole first" colspan="${cols.length}"><span class="hit wide">Whole site</span></td>`;
      return cols
        .map((c, i) => {
          const cell = hits.pages.get(c.label);
          const cls = `cell${i === 0 ? " first" : ""}`;
          if (cell) return `<td class="${cls}">${mark(cell, devices)}</td>`;
          if (!c.checked)
            return `<td class="${cls} unknown" title="Not checked"><span class="sr">Not checked</span></td>`;
          return `<td class="${cls}"><span class="none" aria-hidden="true"></span><span class="sr">Not found</span></td>`;
        })
        .join("");
    })
    .join("");
  return `<tr><th scope="row" class="finding"><strong>${esc(f.say)}.</strong> <span class="why">${esc(f.why)}</span>${where.length ? `<span class="where narrow">Where: ${esc(where.join("; "))}</span>` : ""}${other.length ? `<span class="where also">Also: ${esc(other.join("; "))}</span>` : ""}${f.href ? ` <a class="evidence" href="${esc(f.href)}">Evidence</a>` : ""}</th>${cells}</tr>`;
}

// Findings as a grid: one row per finding, one column per page on each site.
export function findingsGrid(data, findings, devices, { smaller } = {}) {
  const sites = sitesOf(data.project),
    pages = pagesBySite(data, sites),
    ctx = { sites, pages, devices },
    span = 1 + sites.reduce((n, s) => n + Math.max(1, pages.get(s.id).size), 0);
  const head = `<thead><tr><td class="corner" rowspan="2"></td>${sites
    .map(
      (s) =>
        `<th scope="colgroup" class="site first" colspan="${Math.max(1, pages.get(s.id).size)}">${esc(s.label)}</th>`,
    )
    .join("")}</tr><tr>${sites
    .map((s) =>
      [...pages.get(s.id).values()]
        .map(
          (p, i) =>
            `<th scope="col" class="page${i === 0 ? " first" : ""}">${esc(p.label)}</th>`,
        )
        .join(""),
    )
    .join("")}</tr></thead>`;
  const groups = [
    ["Most important", findings.filter((f) => f.rank <= 2)],
    ["Also worth fixing", findings.filter((f) => f.rank === 3)],
    ["Smaller things", findings.filter((f) => f.rank >= 4)],
  ].filter(([, fs]) => fs.length);
  const body = groups
    .map(
      ([label, fs]) =>
        `<tbody><tr class="group"><th scope="rowgroup" colspan="${span}">${esc(label)}</th></tr>${fs.map((f) => row(f, ctx)).join("")}</tbody>`,
    )
    .join("");
  return `${sites.length > 1 && !smaller ? `<p class="tally">${tally(findings, sites)}</p>` : ""}<div class="grid-wrap"><table class="grid"><caption class="sr">Findings by site and page</caption>${head}${body}</table></div>${smaller ? "" : `<p class="key"><span class="hit"><span class="dot"></span></span> found on every device · <span class="hit part"><span class="dot"></span><span class="only">mobile</span></span> found on one device only · <span class="none"></span> not found · <span class="unknown-key"></span> page could not be checked</p>`}`;
}

function tally(findings, sites) {
  const on = (f) => {
    const { bySide } = cellsFor(f, sites);
    return sites
      .filter((s) => bySide.get(s.id).whole || bySide.get(s.id).pages.size)
      .map((s) => s.id);
  };
  const counts = new Map();
  for (const f of findings) {
    const key = on(f).join("|");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const label = new Map(sites.map((s) => [s.id, s.label]));
  const parts = [...counts.entries()]
    .filter(([k]) => k)
    .sort((a, b) => {
      const ia = a[0].split("|"),
        ib = b[0].split("|"),
        at = (k) => sites.findIndex((s) => s.id === k);
      return ia.length - ib.length || at(ia[0]) - at(ib[0]);
    })
    .map(([k, n]) => {
      const ids = k.split("|");
      return ids.length === sites.length
        ? `${n} on both`
        : `${n} only on the ${list(ids.map((id) => esc(label.get(id))))}`;
    });
  return `Of ${plural(findings.length, "finding")}, ${list(parts)}.`;
}

// Main content loading time (LCP), by page and device, every site on one scale.
const GOOD = 2500,
  POOR = 4000;
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

export function loadingChart(data) {
  const sites = sitesOf(data.project),
    groups = aggregatePerformance(data.results.performance || []).filter(
      (g) => g.metrics["largest-contentful-paint"],
    );
  if (!groups.length) return "";
  const devices = [...new Set(groups.map((g) => g.target.device))],
    pages = [];
  for (const g of groups) {
    const label = g.target.label || g.target.page;
    if (!pages.includes(label)) pages.push(label);
  }
  const find = (label, device, side) =>
    groups.find(
      (g) =>
        (g.target.label || g.target.page) === label &&
        g.target.device === device &&
        g.target.side === side,
    );
  const medians = groups.map(
    (g) => g.metrics["largest-contentful-paint"].median,
  );
  const top = Math.max(
    6000,
    Math.ceil((Math.max(...medians) * 1.15) / 2000) * 2000,
  );
  const at = (ms) => `${Math.min(100, (ms / top) * 100).toFixed(2)}%`;
  const ticks = [];
  for (let t = 0; t <= top; t += top > 10000 ? 4000 : 2000) ticks.push(t);
  const bands = `<span class="band good" style="left:0;width:${at(GOOD)}"></span><span class="band fair" style="left:${at(GOOD)};width:${at(POOR - GOOD)}"></span><span class="band poor" style="left:${at(POOR)};right:0"></span>`;
  const axis = `<div class="lcp-row axis" aria-hidden="true"><span class="name"></span><span class="track">${ticks.map((t, i) => `<span class="tick${i === 0 ? " start" : i === ticks.length - 1 ? " end" : ""}" style="left:${at(t)}">${t ? `${t / 1000} s` : "0"}</span>`).join("")}<span class="zone" style="left:0;width:${at(GOOD)}">Good</span><span class="zone" style="left:${at(GOOD)};width:${at(POOR - GOOD)}">Needs work</span><span class="zone" style="left:${at(POOR)};right:0">Poor</span></span><span class="value"></span><span class="score">Score</span></div>`;
  const bar = (g, site) => {
    if (!g)
      return `<div class="lcp-row"><span class="name" title="${esc(site.label)}">${esc(site.label)}</span><span class="track">${bands}<span class="missing">Not measured</span></span><span class="value">—</span><span class="score">—</span></div>`;
    const s = g.metrics["largest-contentful-paint"],
      over = s.max > top;
    const spread =
      s.max > s.min
        ? `<span class="spread" style="left:${at(s.min)};width:calc(${at(Math.min(s.max, top))} - ${at(s.min)})"></span>`
        : "";
    const label = `${site.label}: ${seconds(s.median)}${g.runs > 1 ? `, ${seconds(s.min)} to ${seconds(s.max)} over ${g.runs} runs` : ""}`;
    return `<div class="lcp-row" role="img" aria-label="${esc(label)}"><span class="name" title="${esc(site.label)}">${esc(site.label)}</span><span class="track">${bands}${spread}<span class="median side-${esc(site.id)}" style="left:${at(s.median)}"></span>${over ? `<span class="over">${seconds(s.max)} →</span>` : ""}</span><span class="value">${seconds(s.median)}${g.runs > 1 && s.max > s.min ? `<small>${seconds(s.min)}–${seconds(s.max)}</small>` : ""}</span><span class="score">${Number.isFinite(g.performance?.median) ? Math.round(g.performance.median) : "—"}</span></div>`;
  };
  const change = (a, b) => {
    if (!a || !b) return "";
    const d =
      b.metrics["largest-contentful-paint"].median -
      a.metrics["largest-contentful-paint"].median;
    if (Math.abs(d) < 150)
      return `<span class="delta same">About the same</span>`;
    return `<span class="delta ${d < 0 ? "faster" : "slower"}">${seconds(Math.abs(d))} ${d < 0 ? "faster" : "slower"}</span>`;
  };
  const blocks = devices
    .map(
      (device) =>
        `<div class="lcp-device"><h3>${esc(device[0].toUpperCase() + device.slice(1))}</h3>${axis}${pages
          .map((label) => {
            const gs = sites.map((s) => find(label, device, s.id));
            if (gs.every((g) => !g)) return "";
            return `<div class="lcp-page"><div class="lcp-title"><span>${esc(label)}</span>${sites.length === 2 ? change(gs[0], gs[1]) : ""}</div>${sites.map((s, i) => bar(gs[i], s)).join("")}</div>`;
          })
          .join("")}</div>`,
    )
    .join("");
  const many = groups.some((g) => g.runs > 1);
  return `<figure class="lcp"><figcaption><strong>How long the main content takes to appear.</strong> Each dot is the ${many ? "middle of the runs; the bar shows the fastest to slowest run" : "measured time"}. Shaded zones are Google’s limits: under 2.5 seconds is good, over 4 seconds is poor.${sites.length === 2 ? ` The change is the ${esc(sites[1].label)} compared with the ${esc(sites[0].label)}.` : ""} Score is Google’s overall loading score out of 100.</figcaption>${blocks}</figure>`;
}

export const visualStyles = `
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.tally{margin:4px 0 12px;font-size:15px}
.grid-wrap{margin:8px 0 4px}
.grid{table-layout:auto;font-size:14px;width:100%}
.grid th,.grid td{border-bottom:1px solid #e3e3e3;padding:8px 6px;vertical-align:middle}
.grid td:last-child{min-width:0}
.grid .corner{border-bottom:0}
.grid th.site{text-align:center;font-size:13px;font-weight:600;border-bottom:1px solid #999;padding-bottom:4px}
.grid th.page{overflow-wrap:normal;text-align:center;font-weight:400;font-size:12px;color:#444;line-height:1.25;vertical-align:bottom;min-width:56px;max-width:84px}
.grid .first{border-left:1px solid #bbb}
.grid th.finding{font-weight:400;text-align:left;width:46%;padding-right:16px;line-height:1.4}
.grid th.finding strong{font-weight:600}
.grid .why{color:#444}
.grid .where{display:block;font-size:13px;color:#555;margin-top:2px}
.grid .where.narrow{display:none}
.grid .evidence{font-size:13px;white-space:nowrap}
.grid tr.group th{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#555;font-weight:600;padding:20px 0 6px;border-bottom:1px solid #999;text-align:left}
.grid tbody:first-of-type tr.group th{padding-top:10px}
.grid td.cell{text-align:center;padding:6px 2px}
.hit{display:inline-flex;flex-direction:column;align-items:center;gap:1px;color:#1d3f73;font-size:12px;font-weight:600;line-height:1.1;font-variant-numeric:tabular-nums}
.hit .dot{width:12px;height:12px;border-radius:50%;background:#1d3f73;display:block}
.hit.part .dot{background:#fff;border:2px solid #1d3f73;width:12px;height:12px}
.hit.value{background:#e7eef8;border-radius:3px;padding:3px 5px}
.hit .only{font-size:10px;font-weight:400;color:#1d3f73}
.hit.wide{display:block;background:#e7eef8;border-radius:3px;padding:4px 6px;font-weight:600}
.none{display:inline-block;width:4px;height:4px;border-radius:50%;background:#c4c4c4;vertical-align:middle}
.grid td.unknown{background:repeating-linear-gradient(135deg,#fff 0 4px,#ececec 4px 6px)}
.unknown-key{display:inline-block;width:14px;height:10px;vertical-align:middle;background:repeating-linear-gradient(135deg,#fff 0 3px,#d6d6d6 3px 5px);border:1px solid #ccc}
.key{font-size:13px;color:#555;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;max-width:none}
.key .hit{flex-direction:row;gap:4px;vertical-align:middle}
.lcp{margin:12px 0 24px;max-width:1100px}
.lcp figcaption{font-size:14px;color:#333;max-width:90ch;margin-bottom:8px}
.lcp h3{font-size:15px;margin:20px 0 4px}
.lcp-page{padding:8px 0;border-bottom:1px solid #e3e3e3}
.lcp-title{display:flex;gap:12px;align-items:baseline;font-weight:600;font-size:14px;margin-bottom:4px}
.delta{font-weight:600;font-size:13px;font-variant-numeric:tabular-nums}
.delta.faster{color:#1c6b3a}.delta.slower{color:#9a3412}.delta.same{color:#555;font-weight:400}
.lcp-row{display:grid;grid-template-columns:minmax(110px,180px) 1fr 92px 48px;gap:10px;align-items:center;font-size:13px;min-height:24px}
.lcp-row .name{color:#444;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lcp-row .track{position:relative;height:18px}
.lcp-row .band{position:absolute;top:3px;bottom:3px}
.band.good{background:#e6f2ea}.band.fair{background:#fbf1dc}.band.poor{background:#f8e3e0}
.lcp-row .spread{position:absolute;top:8px;height:2px;background:#555}
.lcp-row .median{position:absolute;top:3px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#1d3f73;border:2px solid #fff;box-shadow:0 0 0 1px #1d3f73}
.lcp-row .median.side-before{background:#8a8a8a;box-shadow:0 0 0 1px #6b6b6b}
.lcp-row .over{position:absolute;right:0;top:-1px;font-size:11px;color:#555;background:#f8e3e0;padding:0 2px}
.lcp-row .missing{position:absolute;left:6px;top:0;font-size:12px;color:#555}
.lcp-row .value{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.lcp-row .value small{display:block;font-weight:400;color:#666;font-size:11px}
.lcp-row .score{text-align:right;font-variant-numeric:tabular-nums;color:#444}
.lcp-row.axis{min-height:30px;font-size:11px;color:#666}
.lcp-row.axis .track{height:30px}
.lcp-row.axis .tick{position:absolute;bottom:0;transform:translateX(-50%);white-space:nowrap}.lcp-row.axis .tick.start{transform:none}.lcp-row.axis .tick.end{transform:translateX(-100%)}
.lcp-row.axis .zone{position:absolute;top:0;text-align:center;font-size:11px;color:#555;white-space:nowrap;overflow:hidden}
.lcp-row.axis .score{font-size:11px;color:#666}
@media(max-width:760px){
.grid thead,.grid td.cell{display:none}
.grid th.finding{width:auto;padding-right:0}
.grid .where.narrow{display:block}.grid .where.also{display:none}
.grid tr.group th{padding-top:16px}
.key{display:none}
.lcp-row{grid-template-columns:84px 1fr 56px;gap:6px}
.lcp-row .score{display:none}
.lcp-row .value small{display:none}
.lcp-row.axis .zone{font-size:10px}
}
@media print{.grid{font-size:8.5pt}.grid .evidence{display:none}.grid .where{font-size:8pt}.grid th.page{font-size:7.5pt}.lcp-page{break-inside:avoid}.band.good,.band.fair,.band.poor,.hit.value,.hit.wide,.grid td.unknown,.lcp-row .median,.hit .dot{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
