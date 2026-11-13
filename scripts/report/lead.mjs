import { describe } from "./wording.mjs";
import { humanDate } from "../report.mjs";

export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const plural = (n, one, many = one + "s") =>
  `${n} ${n === 1 ? one : many}`;
export const list = (items) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

// Findings are grouped by cause: one entry per wording type, however many
// pages it appears on. A place is a string, or { site, page, device, note }.
export function collector() {
  const found = new Map();
  return {
    add(type, place, { impact, href, say, why } = {}) {
      const key = say ? `${type}|${say}` : type;
      let f = found.get(key);
      if (!f) {
        f = { type, ...describe(type, { impact }), places: [], href };
        if (say) f.say = say;
        if (why) f.why = why;
        found.set(key, f);
      } else if (impact)
        f.rank = Math.min(f.rank, describe(type, { impact }).rank);
      if (place) f.places.push(place);
      f.href ||= href;
      return f;
    },
    list() {
      return [...found.values()].sort(
        (a, b) =>
          a.rank - b.rank ||
          b.places.length - a.places.length ||
          (a.say < b.say ? -1 : 1),
      );
    },
  };
}

// "Home, Gallery (mobile) and 3 more": a page seen on every device is named once.
export function places(finding, devices = [], limit = 6) {
  const order = [],
    seen = new Map();
  for (const p of finding.places) {
    const o = typeof p === "string" ? { page: p } : p;
    const key = [o.site, o.page, o.note].join("|");
    if (!seen.has(key)) {
      seen.set(key, { ...o, devices: new Set() });
      order.push(key);
    }
    if (o.device) seen.get(key).devices.add(o.device);
  }
  const name = (o) => {
    const some =
      o.devices.size && o.devices.size < devices.length
        ? ` (${[...o.devices].join(", ")})`
        : "";
    return `${o.page}${some}${o.note ? `: ${o.note}` : ""}`;
  };
  const all = order.map((key) => seen.get(key)),
    shown = all.slice(0, limit),
    sites = [...new Set(shown.map((o) => o.site || ""))];
  // On a report covering two sites, name each site once.
  const names = sites.some(Boolean)
    ? sites.map(
        (site) =>
          `${site}: ${shown
            .filter((o) => (o.site || "") === site)
            .map(name)
            .join(", ")}`,
      )
    : shown.map(name);
  return all.length > limit ? [...names, `${all.length - limit} more`] : names;
}

// The first screen of every report: what was checked, what was found in
// order of consequence, and what needs a decision. Nothing else goes here.
export function lead({
  title,
  at,
  checked,
  findings = [],
  devices = [],
  quiet = "Nothing that needs attention.",
  notes = [],
}) {
  const decisions = [
    ...new Set(
      findings.filter((f) => f.rank < 5 && f.decide).map((f) => f.decide),
    ),
  ];
  const item = (f) => {
    const where = places(f, devices);
    return `<li><strong>${esc(f.say)}.</strong> ${esc(f.why)}${where.length ? `<br><span class="where">Where: ${esc(where.join("; "))}</span>` : ""}${f.href ? ` <a href="${esc(f.href)}">See the evidence</a>` : ""}</li>`;
  };
  const shown = findings.filter((f) => f.rank < 4),
    smaller = findings.filter((f) => f.rank === 4);
  return `<header class="lead"><h1>${esc(title)}</h1><p class="when">${esc(humanDate(at))}</p><div class="block"><h2>What was checked</h2><p>${checked}</p>${notes.map((n) => `<p>${esc(n)}</p>`).join("")}</div><div class="block"><h2>What was found</h2>${
    shown.length
      ? `<ol class="found">${shown.map(item).join("")}</ol>`
      : `<p>${esc(smaller.length ? "Nothing serious." : quiet)}</p>`
  }${smaller.length ? `<details><summary>${plural(smaller.length, "smaller thing")}</summary><ul class="found">${smaller.map(item).join("")}</ul></details>` : ""}</div><div class="block"><h2>What needs a decision</h2>${
    decisions.length
      ? `<ul>${decisions.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`
      : "<p>Nothing.</p>"
  }</div></header>`;
}
