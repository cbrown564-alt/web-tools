import { createHash } from "node:crypto";
import { parseTool } from "../cli/grammar.mjs";
import { load } from "cheerio";
import { safeUrl } from "../site-check/core.mjs";
export const agent = "WebToolsInventory/1.0";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export function inventoryOptions(args = process.argv.slice(2)) {
  const { values } = parseTool("inventory", args);
  for (const [key, max] of [
    ["depth", 5],
    ["max-urls", 10000],
    ["max-sitemaps", 200],
    ["capture-limit", 200],
  ]) {
    const n = Number(values[key]);
    if (!/^\d+$/.test(values[key]) || n < (key === "depth" ? 0 : 1) || n > max)
      throw Error(`Invalid --${key} (maximum ${max})`);
    values[key] = n;
  }
  for (const key of ["run", "render", "compare"])
    if (values[key] && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(values[key]))
      throw Error(`Invalid --${key} name`);
  if (!["all", "representative", "none"].includes(values.captures))
    throw Error("--captures must be all, representative or none");
  values.devices = values.devices?.split(",");
  return values;
}
export function selectSite(project, options) {
  const competitors = project.inventory?.competitors || [];
  const ids = new Set(project.sites.map((s) => s.id));
  for (const s of competitors) {
    const u = new URL(s.baseUrl);
    if (
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id) ||
      ids.has(s.id) ||
      !s.label ||
      u.protocol !== "https:" ||
      u.username ||
      u.password
    )
      throw Error("Invalid inventory competitor");
    ids.add(s.id);
  }
  const sites = [...project.sites, ...competitors];
  const id =
    options.site ||
    (project.sites.length === 1
      ? project.sites[0].id
      : project.inventory?.site);
  const site = sites.find((s) => s.id === id);
  if (!site) throw Error("Choose a recorded --site (before, after or live)");
  if (options.devices?.some((d) => !project.devices[d]))
    throw Error("Unknown capture device");
  return site;
}
export function inScope(value, base) {
  try {
    const u = new URL(value),
      b = new URL(base);
    return (
      ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      u.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "") &&
      u.port === b.port
    );
  } catch {
    return false;
  }
}
export function normalize(value, source, base) {
  let u;
  try {
    u = new URL(value, source);
  } catch {
    return { reason: "invalid URL" };
  }
  if (!inScope(u.href, base))
    return { reason: "external or credentialled URL" };
  if (
    /\.(?:pdf|jpe?g|png|gif|svg|webp|avif|ico|zip|ics|xml|mp[34]|mov|woff2?|ttf|css|js|docx?|xlsx?|csv|json)(?:\/)?$/i.test(
      u.pathname,
    ) ||
    /^\/(?:wp-|feed(?:\/|$)|comments(?:\/|$))/.test(u.pathname)
  )
    return { reason: "asset, API or feed" };
  if (
    /\/(?:logout|customer-logout|signout|sign-out|delete|unsubscribe)(?:\/|$)/i.test(
      u.pathname,
    )
  )
    return { reason: "action URL" };
  for (const k of [...u.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid|msclkid)$/i.test(k)) u.searchParams.delete(k);
  if (
    [...u.searchParams.keys()].some((k) =>
      /action|nonce|logout|add.to.cart|remove|token|key|pass|secret|auth|email|ical|redirect|download/i.test(
        k,
      ),
    )
  )
    return { reason: "action, export or sensitive query" };
  if (
    /\/events(?:\/|$)/i.test(u.pathname) &&
    (/\b20\d\d[-/]\d\d/.test(u.pathname) || u.search)
  )
    return { reason: "calendar date generator" };
  if (
    [...u.searchParams.keys()].some(
      (k) => !["page", "paged", "p", "page_id"].includes(k),
    )
  )
    return { reason: "unbounded query" };
  u.searchParams.sort();
  u.hash = "";
  u.protocol = new URL(base).protocol;
  u.host = new URL(base).host;
  return { url: u.href };
}
export function inspectHtml(html, url, rules = []) {
  const $ = load(html);
  const absolute = (value) => {
    try {
      return safeUrl(new URL(value, url).href);
    } catch {
      return null;
    }
  };
  const assets = [];
  $('script[src],link[rel="stylesheet"][href]').each((_, n) => {
    const a = absolute($(n).attr("src") || $(n).attr("href"));
    if (a) assets.push(a);
  });
  const plugins = new Map(),
    themes = new Map();
  for (const asset of assets) {
    const u = new URL(asset);
    for (const [kind, store] of [
      ["plugins", plugins],
      ["themes", themes],
    ]) {
      const m = u.pathname.match(new RegExp(`/wp-content/${kind}/([^/]+)/`));
      if (m) {
        const key = m[1];
        const row = store.get(key) || {
          name: key,
          assetVersions: [],
          evidence: [],
        };
        const v = u.searchParams.get("ver");
        if (v && !row.assetVersions.includes(v)) row.assetVersions.push(v);
        if (!row.evidence.includes(asset)) row.evidence.push(asset);
        store.set(key, row);
      }
    }
  }
  const generators = $('meta[name="generator"]')
    .map((_, n) => $(n).attr("content"))
    .get();
  const platform = [];
  if (
    generators.some((g) => /wordpress/i.test(g)) ||
    assets.some((a) => /\/wp-(content|includes)\//.test(a))
  )
    platform.push({
      name: "WordPress",
      basis: "generator or public asset paths",
    });
  if ($("#__NEXT_DATA__").length || assets.some((a) => a.includes("/_next/")))
    platform.push({ name: "Next.js", basis: "public markup or asset paths" });
  for (const g of generators)
    platform.push({ name: g, basis: "generator metadata" });
  const bodyClasses = ($("body").attr("class") || "")
    .split(/\s+/)
    .filter(Boolean);
  let group = new URL(url).pathname === "/" ? "Home" : "Content page",
    groupBasis = "URL or generic document";
  for (const c of bodyClasses) {
    if (
      /^(single-(?!postid)|post-type-archive-|page-template-(?!default)|tax-|category$|archive$)/.test(
        c,
      )
    ) {
      group = c;
      groupBasis = "body class";
      break;
    }
  }
  for (const rule of rules) {
    if (new RegExp(rule.pattern).test(new URL(url).pathname)) {
      group = rule.name;
      groupBasis = "project URL rule";
      break;
    }
  }
  const forms = $("form")
    .map((_, n) => ({
      method: ($(n).attr("method") || "get").toUpperCase(),
      action: absolute($(n).attr("action") || url),
      fields: $(n)
        .find("input,select,textarea")
        .map((_, f) => ({
          name: $(f).attr("name") || "",
          type: $(f).attr("type") || f.tagName,
        }))
        .get(),
    }))
    .get();
  const trackers = [];
  const markers = [
    ["Google Tag Manager", /googletagmanager\.com/],
    ["Google Analytics", /google-analytics\.com|gtag\s*\(/],
    ["Meta Pixel", /connect\.facebook\.net|fbq\s*\(/],
    ["Microsoft Clarity", /clarity\.ms/],
    ["Herefish", /herefish\.com|hfAccountId/],
    ["Hotjar", /hotjar\.com/],
  ];
  const scripts = $("script")
    .map((_, n) => $(n).attr("src") || $(n).html() || "")
    .get();
  for (const [name, re] of markers)
    if (scripts.some((s) => re.test(s)))
      trackers.push({
        name,
        basis: "script URL or inline marker; delivery not verified",
      });
  return {
    title: $("title").first().text().trim(),
    canonicals: $('link[rel="canonical"]')
      .map((_, n) => absolute($(n).attr("href")))
      .get(),
    indexing: $('meta[name="robots"]')
      .map((_, n) => $(n).attr("content"))
      .get(),
    bodyClasses,
    template: { group, basis: groupBasis },
    links: $("a[href]")
      .map((_, n) => $(n).attr("href"))
      .get(),
    probe: {
      platform,
      plugins: [...plugins.values()],
      themes: [...themes.values()],
      forms,
      trackers,
    },
  };
}
const HISTORY_NOTE =
  "Historical URLs are also supplied as seeds, subject to the same exclusions and robots rules. Counts describe URLs observed, including redirects and errors, not only live pages. Absence is not proof of deletion.";
const hostsOf = (urls) => [...new Set(urls.map((u) => new URL(u).host))].sort();
function otherHostNote(otherHost, base, compared) {
  if (!otherHost.count) return HISTORY_NOTE;
  const where = otherHost.hosts.join(", "),
    here = new URL(base).host;
  return compared
    ? `${otherHost.count} historical URLs are on ${where}, not ${here}, and were left out of the comparison. ${HISTORY_NOTE}`
    : `The earlier record lists addresses on ${where}; this crawl was of ${here}. Exact addresses on different hosts cannot match, so the two lists were not compared.`;
}
// Exact-URL comparison only means something on the crawled host. History
// URLs on another host (a production record against a redesign preview) are
// counted and named but never reported as absent or used to call rows added.
export function reconcile(rows, history, base) {
  const all = [...new Set(history.urls.map((u) => new URL(u, base).href))],
    before = new Set(all.filter((u) => inScope(u, base))),
    elsewhere = all.filter((u) => !inScope(u, base)),
    now = new Map(rows.map((r) => [r.url, r])),
    compared = before.size > 0,
    otherHost = { count: elsewhere.length, hosts: hostsOf(elsewhere) };
  const absent = [...before].filter((u) => !now.has(u)).sort();
  const absentDetails = absent.map((url) => {
    const n = normalize(url, base, base);
    return {
      url,
      reason:
        n.reason ||
        (now.has(n.url)
          ? "URL normalization"
          : "not collected; inspect crawl limits and pending URLs"),
    };
  });
  const observedStatus = {};
  for (const url of before) {
    const r = now.get(url);
    if (r) {
      const label = r.status ? String(r.status) : r.collection;
      observedStatus[label] = (observedStatus[label] || 0) + 1;
    }
  }
  return {
    source: history.source,
    sourceSha256: history.sourceSha256,
    recordedAt: history.recordedAt,
    compared,
    historicalCount: before.size,
    otherHost,
    currentCount: now.size,
    shared: [...now.keys()].filter((u) => before.has(u)).length,
    added: compared ? [...now.keys()].filter((u) => !before.has(u)).sort() : [],
    absent,
    absentDetails,
    historicalStatus: observedStatus,
    note: otherHostNote(otherHost, base, compared),
  };
}
// Runs saved before the host check stored every off-host history URL as
// absent. Rescope them on render so an offline rebuild does not repeat that.
export function scopeReconciliation(r, base) {
  if (!r || !base || "compared" in r) return r;
  const keep = (u) => inScope(u, base),
    elsewhere = r.absent.filter((u) => !keep(u));
  if (!elsewhere.length)
    return { ...r, compared: true, otherHost: { count: 0, hosts: [] } };
  const absent = r.absent.filter(keep),
    historicalCount = r.shared + absent.length,
    compared = historicalCount > 0,
    otherHost = { count: elsewhere.length, hosts: hostsOf(elsewhere) };
  return {
    ...r,
    compared,
    historicalCount,
    otherHost,
    added: compared ? r.added : [],
    absent,
    absentDetails: (r.absentDetails || []).filter((a) => keep(a.url)),
    note: otherHostNote(otherHost, base, compared),
  };
}
export function captureSelection(rows, project, site, mode, limit) {
  const eligible = rows.filter(
    (r) => r.status >= 200 && r.status < 300 && r.html,
  );
  if (mode === "none") return [];
  if (mode === "all") return eligible;
  const urls = new Set(
    project.pages.map(
      (p) => new URL(p[`${site.id}Path`] ?? p.path, site.baseUrl).href,
    ),
  );
  const chosen = eligible.filter((r) => urls.has(r.url)),
    groups = new Set(chosen.map((r) => r.template.group));
  for (const r of eligible)
    if (!groups.has(r.template.group) && chosen.length < limit) {
      chosen.push(r);
      groups.add(r.template.group);
    }
  return chosen.slice(0, limit);
}
