export const decisions = [
  "undecided",
  "keep",
  "rewrite",
  "consolidate",
  "remove",
];
export const fields = [
  "projectId",
  "inventorySha256",
  "url",
  "decision",
  "destination",
  "redirectStatus",
  "removeStatus",
  "notes",
];
export function defaultRow(url) {
  return {
    url,
    decision: "undecided",
    destination: "",
    redirectStatus: 301,
    removeStatus: 410,
    notes: "",
  };
}
export function validWebUrl(value, base) {
  if (
    typeof value !== "string" ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    (!/^https?:\/\//i.test(value) &&
      (!base || !value.startsWith("/") || value.startsWith("//")))
  )
    throw Error("Destination must be an HTTP(S) URL or absolute path");
  let u;
  try {
    u = new URL(value, base);
  } catch {
    throw Error("Destination must be a URL or absolute path");
  }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw Error("Destination must use HTTP(S) without credentials");
  if (u.hash) throw Error("Redirect destinations cannot contain fragments");
  if (
    [...u.searchParams.keys()].some((k) =>
      /nonce|token|password|secret|auth|key|email/i.test(k),
    )
  )
    throw Error("Destination contains a sensitive query parameter");
  return u.href;
}
export function validateRow(row, known, base, { ready = false } = {}) {
  if (!row || !known.has(row.url)) throw Error("Unknown inventory URL");
  if (!decisions.includes(row.decision)) throw Error("Unknown page decision");
  for (const key of ["notes", "destination"])
    if (
      typeof row[key] !== "string" ||
      row[key].length > (key === "notes" ? 5000 : 2000)
    )
      throw Error(`Invalid ${key}`);
  if (
    ![301, 308].includes(row.redirectStatus) ||
    ![404, 410].includes(row.removeStatus)
  )
    throw Error("Invalid HTTP status");
  if (row.decision !== "consolidate" && row.destination)
    throw Error("Only consolidate uses a destination");
  if (row.decision === "consolidate") {
    if (!row.destination.trim()) {
      if (ready) throw Error("Consolidate needs a destination");
    } else if (ready && validWebUrl(row.destination, base) === row.url)
      throw Error("A URL cannot redirect to itself");
  }
  return {
    url: row.url,
    decision: row.decision,
    destination: row.destination,
    redirectStatus: row.redirectStatus,
    removeStatus: row.removeStatus,
    notes: row.notes,
  };
}
export function newPlan(manifest) {
  return {
    version: 1,
    tool: "content-decisions",
    projectId: manifest.project.id,
    inventorySha256: manifest.inventorySha256,
    revision: "",
    rows: manifest.pages.map((p) => defaultRow(p.url)),
  };
}
export function validatePlan(value, manifest) {
  if (
    value?.version !== 1 ||
    value.tool !== "content-decisions" ||
    value.projectId !== manifest.project.id ||
    value.inventorySha256 !== manifest.inventorySha256
  )
    throw Error("This file belongs to a different project or inventory");
  const known = new Set(manifest.pages.map((p) => p.url));
  if (!Array.isArray(value.rows) || value.rows.length !== known.size)
    throw Error("Decision file must contain every inventory URL");
  const seen = new Set(),
    rows = value.rows.map((r) => {
      if (seen.has(r.url)) throw Error("Duplicate URL");
      seen.add(r.url);
      return validateRow(r, known, manifest.site.baseUrl);
    });
  return {
    ...newPlan(manifest),
    revision: typeof value.revision === "string" ? value.revision : "",
    rows,
  };
}
const protect = (s) => (/^[=+\-@\t\r']/.test(String(s)) ? "'" + s : String(s));
const unprotect = (s) => (/^'[=+\-@\t\r']/.test(s) ? s.slice(1) : s);
export function toCsv(plan) {
  return (
    "\ufeff" +
    [
      fields,
      ...plan.rows.map((r) =>
        fields.map((f) =>
          protect(
            f === "projectId"
              ? plan.projectId
              : f === "inventorySha256"
                ? plan.inventorySha256
                : r[f],
          ),
        ),
      ),
    ]
      .map((row) =>
        row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}
export function parseCsv(text) {
  text = text.replace(/^\ufeff/, "");
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw Error("Invalid CSV quote");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed) throw Error("Unexpected text after CSV quote");
      cell += c;
    }
  }
  if (quoted) throw Error("Unclosed CSV quote");
  if (cell || row.length || closed) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
export function importCsv(text, plan, manifest) {
  const data = parseCsv(text),
    header = data.shift();
  if (JSON.stringify(header) !== JSON.stringify(fields) || !data.length)
    throw Error("Use the exported spreadsheet columns");
  const known = new Set(manifest.pages.map((p) => p.url)),
    seen = new Set(),
    updates = new Map();
  for (const cells of data) {
    if (cells.length !== fields.length)
      throw Error("CSV column count does not match");
    const r = Object.fromEntries(
      fields.map((f, i) => [f, unprotect(cells[i])]),
    );
    if (
      r.projectId !== plan.projectId ||
      r.inventorySha256 !== plan.inventorySha256
    )
      throw Error("Spreadsheet belongs to a different project or inventory");
    if (seen.has(r.url)) throw Error("Duplicate spreadsheet URL");
    seen.add(r.url);
    r.redirectStatus = Number(r.redirectStatus);
    r.removeStatus = Number(r.removeStatus);
    try {
      updates.set(r.url, validateRow(r, known, manifest.site.baseUrl));
    } catch (e) {
      throw Error(`Spreadsheet ${r.url || "(missing URL)"}: ${e.message}`);
    }
  }
  return { ...plan, rows: plan.rows.map((r) => updates.get(r.url) || r) };
}
export function compileMap(plan, manifest) {
  const validated = validatePlan(plan, manifest),
    known = new Set(manifest.pages.map((p) => p.url)),
    errors = [],
    rules = [];
  for (const row of validated.rows) {
    if (row.decision === "undecided") continue;
    try {
      validateRow(row, known, manifest.site.baseUrl, { ready: true });
      rules.push({
        source: row.url,
        decision: row.decision,
        status:
          row.decision === "remove"
            ? row.removeStatus
            : row.decision === "consolidate"
              ? row.redirectStatus
              : 200,
        destination:
          row.decision === "consolidate"
            ? validWebUrl(row.destination, manifest.site.baseUrl)
            : null,
        notes: row.notes,
      });
    } catch (e) {
      errors.push(`${row.url}: ${e.message}`);
    }
  }
  const bySource = new Map(rules.map((r) => [r.source, r]));
  for (const rule of rules.filter((r) => r.destination)) {
    const target = bySource.get(rule.destination);
    if (target?.destination)
      errors.push(
        `${rule.source}: destination has another redirect; target the final URL`,
      );
    if (target?.decision === "remove")
      errors.push(`${rule.source}: destination is marked remove`);
  }
  if (errors.length) throw Error(errors.join("\n"));
  return {
    version: 1,
    tool: "redirect-map",
    projectId: plan.projectId,
    inventorySha256: plan.inventorySha256,
    sourceSite: manifest.site,
    createdAt: new Date().toISOString(),
    coverage: {
      total: plan.rows.length,
      decided: rules.length,
      undecided: plan.rows.length - rules.length,
      inventoryState: manifest.inventoryState,
    },
    complete:
      rules.length === plan.rows.length &&
      manifest.inventoryState === "complete",
    rules,
  };
}
