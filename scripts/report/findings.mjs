import { collector } from "./lead.mjs";
import { describe } from "./wording.mjs";
import { aggregatePerformance, stats } from "../site-check/core.mjs";

// One function per report turns saved results into findings.
// Every type passed to add() must have an entry in wording.mjs;
// tests/wording.test.mjs reads this file to check that.

const sitePlace = (data) => {
  const labels = data.project.labels || {},
    many = (data.project.sites?.length || 2) > 1;
  return (t, note) => ({
    site: many ? labels[t.side] || t.side : "",
    page: t.label || t.page,
    device: t.device,
    note,
  });
};

export function siteCheckFindings(data) {
  const c = collector(),
    place = sitePlace(data),
    key = (t) => [t.side, t.page, t.device].join("/"),
    unavailable = new Set(
      data.preflight.filter((r) => r.status !== "ok").map((r) => key(r.target)),
    );
  for (const r of data.preflight.filter((r) => r.status !== "ok"))
    c.add("collection:skipped", place(r.target), { href: "#method" });
  for (const module of data.options.modules) {
    const rows = data.results[module] || [],
      href = `#${module}`;
    for (const r of rows)
      if (r.status !== "ok" && !unavailable.has(key(r.target)))
        c.add("collection:error", place(r.target, module), { href });
    const ok = rows.filter((r) => r.status === "ok");
    if (module === "performance")
      for (const g of aggregatePerformance(ok)) {
        const score = g.performance?.median;
        if (!Number.isFinite(score)) continue;
        if (score < 50)
          c.add(
            "performance:poor",
            place(g.target, `${Math.round(score)} out of 100`),
            { href },
          );
        else if (score < 90)
          c.add(
            "performance:needs-work",
            place(g.target, `${Math.round(score)} out of 100`),
            { href },
          );
      }
    if (module === "cache")
      for (const r of ok) {
        const time = (mode) =>
          stats(r.result.filter((v) => v.mode === mode).map((v) => v.ttfbMs))
            ?.median;
        const stored = time("plain"),
          fresh = time("unique-query");
        if (fresh >= 1000 && fresh >= 3 * stored)
          c.add(
            "cache:slow-uncached",
            {
              ...place(r.target, `${(fresh / 1000).toFixed(1)} seconds`),
              device: undefined,
            },
            { href },
          );
      }
    if (module === "accessibility")
      for (const r of ok)
        for (const v of r.result.violations)
          c.add(`axe:${v.id}`, place(r.target), { impact: v.impact, href });
    if (module === "security")
      for (const r of ok) {
        const x = r.result,
          where = { ...place(r.target), device: undefined };
        for (const h of x.missingHeaders) c.add(`header:${h}`, where, { href });
        if (!x.redirect.https && !x.redirect.error)
          c.add("redirect:not-https", where, { href });
        for (const f of x.forms || [])
          if (f.https === false) c.add("form:insecure", where, { href });
      }
    if (module === "discovery")
      for (const r of ok) {
        const x = r.result,
          where = { ...place(r.target), device: undefined };
        if (x.httpStatus !== 200)
          c.add("discovery:http-status", where, { href });
        if (x.indexing.some((v) => /noindex/i.test(v)))
          c.add("discovery:noindex", where, { href });
        if (!x.title) c.add("discovery:title-missing", where, { href });
        if (x.canonicals.length === 0)
          c.add("discovery:canonical-missing", where, { href });
        if (x.canonicals.length > 1)
          c.add("discovery:canonical-multiple", where, { href });
        if (x.sharingMissing?.length)
          c.add("discovery:sharing-missing", where, { href });
        if (x.links?.broken.length)
          c.add(
            "discovery:broken-links",
            { ...where, note: `${x.links.broken.length} broken` },
            { href },
          );
        if (x.sitemap === "not listed")
          c.add("discovery:not-in-sitemap", where, { href });
      }
  }
  if (data.options.modules.includes("security"))
    for (const [side, s] of Object.entries(data.sites || {})) {
      if (!s.security) continue;
      const where = data.project.labels?.[side] || side,
        { tls, email } = s.security;
      if (tls.status !== "ok")
        c.add("tls:problem", where, { href: "#security" });
      if (email.spf.status !== "error" && !email.spf.records.length)
        c.add("email:spf-missing", email.domain, { href: "#security" });
      if (email.dmarc.status === "absent")
        c.add("email:dmarc-missing", email.domain, { href: "#security" });
    }
  return c.list();
}

// Watch stores site-check findings as stable strings so runs can be compared.
// This turns one back into a wording type without changing the stored form.
export function findingType(text) {
  const m = /^([a-z]+)\/([^/]+)\/([^/]+)\/([^:]+): (.+)$/.exec(text);
  if (!m) return { type: "collection:error", page: text };
  const [, module, , page, device, rest] = m;
  let type = "collection:error";
  if (/^missing title$/.test(rest)) type = "discovery:title-missing";
  else if (/^missing /.test(rest)) type = `header:${rest.slice(8)}`;
  else if (rest === "HTTP redirect is not HTTPS") type = "redirect:not-https";
  else if (/^\d+ canonicals$/.test(rest))
    type =
      rest[0] === "0"
        ? "discovery:canonical-missing"
        : "discovery:canonical-multiple";
  else if (/^HTTP \d+$/.test(rest)) type = "discovery:http-status";
  else if (module === "accessibility" && / \(\d+ elements\)$/.test(rest))
    type = `axe:${rest.split(" ")[0]}`;
  return { type, page, device };
}

export function watchFindings(data) {
  const c = collector(),
    labels = new Map(data.rows.map((r) => [r.target.page, r.target.label])),
    place = (t, note) => ({ page: t.label || t.page, device: t.device, note });
  if (
    data.state === "baseline-required" ||
    (!data.baseline && !data.rows.some((r) => r.diff))
  )
    c.add("watch:no-baseline", null, { href: "#results" });
  for (const r of data.rows) {
    const href = "#results";
    if (r.status === "error")
      c.add("watch:capture-failed", place(r.target), { href });
    for (const a of r.assertions.filter((a) => a.status === "fail"))
      c.add(`watch:assertion-${a.type}`, place(r.target), { href });
    if (r.diff?.changed)
      c.add(
        r.diff.dimensionsChanged ? "watch:dimensions" : "watch:changed",
        place(r.target),
        { href },
      );
    else if (r.diff?.changedRatio > 0)
      c.add("watch:small-change", place(r.target), { href: "#small" });
  }
  for (const change of data.siteCheckChanges || []) {
    const [, kind, text] = /^(New|Resolved): (.+)$/.exec(change) || [];
    if (!kind) continue;
    const f = findingType(text);
    c.add(
      kind === "New" ? "watch:new-finding" : "watch:resolved-finding",
      {
        page: labels.get(f.page) || f.page,
        device: f.device,
        note: describe(f.type).say,
      },
      { href: "#site-check" },
    );
  }
  if (["error", "partial"].includes(data.siteCheck?.state))
    c.add("watch:site-check-incomplete", null, { href: "#site-check" });
  return c.list();
}

const path = (url) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return String(url);
  }
};

export function inventoryFindings(d) {
  const c = collector();
  if (!d.coverage.complete)
    for (const reason of [...d.coverage.errors, ...d.coverage.limits].slice(
      0,
      6,
    ))
      c.add("inventory:incomplete", reason, { href: "#coverage" });
  if (
    !d.coverage.complete &&
    !d.coverage.errors.length &&
    !d.coverage.limits.length
  )
    c.add("inventory:incomplete", null, { href: "#coverage" });
  for (const r of d.rows) {
    if (r.collection !== "ok" || r.status >= 400)
      c.add(
        "inventory:errors",
        `${path(r.url)} (${r.status >= 400 ? r.status : "no response"})`,
        { href: "#inventory" },
      );
    else if (r.chain?.length > 1)
      c.add("inventory:redirects", path(r.url), { href: "#inventory" });
    for (const cap of r.captures || [])
      if (cap.status === "error")
        c.add("inventory:capture-failed", `${path(r.url)} (${cap.device})`, {
          href: "#inventory",
        });
  }
  for (const url of d.reconciliation?.absent || [])
    c.add("inventory:history-absent", path(url.url || url), {
      href: "#history",
    });
  return c.list();
}

export function redirectFindings(d) {
  const c = collector();
  for (const r of d.rows.filter((r) => r.status !== "pass"))
    c.add(
      "redirect-check:failed",
      { page: path(r.source), note: r.error },
      {
        href: "#results",
      },
    );
  if (!d.mapComplete)
    c.add("redirect-check:partial-map", null, { href: "#results" });
  return c.list();
}

export function releaseFindings(d) {
  const c = collector();
  if (d.failure || d.state === "failed")
    if (!d.forms || d.failure)
      c.add("release:failed", d.failure || null, { href: "#detail" });
  for (const r of d.forms?.rows || [])
    if (r.state === "failed")
      c.add(
        "release:form-failed",
        { page: r.mode, device: r.device, note: r.error || r.reason },
        { href: "#forms" },
      );
  return c.list();
}

export function maximumFindings(d) {
  const c = collector();
  if (d.state !== "complete")
    c.add("maximum:partial", d.failure || null, { href: "#journeys" });
  for (const f of d.findings)
    if (f.label === "unresolved")
      c.add("maximum:unresolved", f.title, { href: `#finding-${f.number}` });
    else
      c.add("maximum:answered", null, {
        href: `#finding-${f.number}`,
        say: f.title,
        why: f.detail,
      });
  return c.list();
}
