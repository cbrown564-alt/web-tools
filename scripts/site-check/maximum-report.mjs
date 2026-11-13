import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reportDocument } from "../report.mjs";
import { redact } from "./core.mjs";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const n = (v, decimals = 1) => (Number.isFinite(v) ? v.toFixed(decimals) : "—");
const range = (s) =>
  s ? `${n(s.median)} (${n(s.min)}–${n(s.max)}), n=${s.n}` : "—";
const link = (file, title = file) => `<a href="${esc(file)}">${esc(title)}</a>`;
const table = (name, heads, rows) =>
  `<div class="scroll" role="region" tabindex="0" aria-label="${esc(name)}"><table><caption>${esc(name)}</caption><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const filmstrip = (r) =>
  `<div class="filmstrip">${(r?.filmstrip || []).map((f) => `<figure><a href="${esc(f.file)}"><img src="${esc(f.file)}" alt="Journey frame at ${n(f.elapsedMs)} milliseconds" loading="lazy"></a><figcaption>${n(f.elapsedMs)} ms</figcaption></figure>`).join("")}</div>`;
export async function writeMaximumReport(dir, input) {
  const d = redact(input);
  const observations = d.observations
    .map(
      (r) =>
        `<article><h3>${esc(r.journey)} · ${esc(r.side)} · ${esc(r.device)}</h3><p>${esc(r.state)} · Sum of step ready times: ${n(r.readyMs)} ms. ${esc(r.error || r.traceError || "")}</p><p>${link(r.resultFile, "Journey and network evidence")} ${r.trace ? `· ${link(r.trace, "Chrome performance trace")}` : ""}</p>${table(
          "Journey steps",
          [
            "Page",
            "Ready ms",
            "Document TTFB / FCP ms",
            "Observed LCP / CLS",
            "Capture",
          ],
          r.steps.map((s) => [
            esc(s.page),
            n(s.readyMs),
            `${n(s.metrics.ttfbMs)} / ${n(s.metrics.fcpMs)}`,
            `${n(s.metrics.observedLcpMs)} / ${n(s.metrics.observedCls, 3)}`,
            link(s.capture.file, "Viewport capture"),
          ]),
        )}<details><summary>Trace filmstrip (${r.filmstrip.length} frames)</summary><div class="filmstrip">${r.filmstrip.map((f) => `<figure><a href="${esc(f.file)}"><img src="${esc(f.file)}" alt="Journey frame at ${n(f.elapsedMs)} milliseconds" loading="lazy"></a><figcaption>${n(f.elapsedMs)} ms</figcaption></figure>`).join("")}</div></details></article>`,
    )
    .join("");
  const experiments = d.experiments
    .map(
      (e) =>
        `<article><h3>${esc(e.spec.question)} · ${esc(e.device)}</h3><p>${esc(e.spec.kind)} · ${esc(e.assessment?.label || "unresolved")}. ${esc(e.assessment?.conclusion || "Experiment incomplete.")}</p><p>${esc(e.assessment?.limitations)}</p><p>Baseline ready ms: ${range(e.assessment?.baseline)}. Candidate: ${range(e.assessment?.candidate)}. Paired savings: ${range(e.assessment?.pairedSavingsMs)}.</p><p>All pairs complete: ${e.assessment?.complete ? "yes" : "no"}; intervention observed: ${e.assessment?.intervention ? "yes" : "no"}; selected parity passed: ${e.assessment?.parity ? "yes" : "no"}; effect threshold met on every pair: ${e.assessment?.repeatable ? "yes" : "no"}.</p>${table(
          "Alternating experiment pairs",
          ["Repetition / order", "Baseline", "Candidate", "Parity"],
          e.pairs.map((p) => [
            `${p.repetition}: ${esc(p.order.join(" → "))}`,
            p.baseline
              ? `${n(p.baseline.readyMs)} ms · ${esc(p.baseline.state)}<br>${link(p.baseline.resultFile, "Measurements")} ${p.baseline.trace ? link(p.baseline.trace, "Trace") : ""}`
              : "missing",
            p.candidate
              ? `${n(p.candidate.readyMs)} ms · ${esc(p.candidate.state)}<br>${link(p.candidate.resultFile, "Measurements")} ${p.candidate.trace ? link(p.candidate.trace, "Trace") : ""}`
              : "missing",
            p.parity?.steps
              ?.map(
                (s) =>
                  `${esc(s.page)}: ${s.passed ? "passed" : "different"}; geometry ${n(s.maxGeometryDeltaPx, 3)} px; changed pixels ${n(s.changedPixelRatio * 100, 3)}%<br>${esc(s.reasons.join("; "))}<br>${link(s.baseline, "Baseline capture")} · ${link(s.candidate, "Candidate capture")}`,
              )
              .join("<br>") || "not compared",
          ]),
        )}<details><summary>First-pair filmstrips</summary><h4>Baseline</h4>${filmstrip(e.pairs[0]?.baseline)}<h4>Candidate</h4>${filmstrip(e.pairs[0]?.candidate)}</details></article>`,
    )
    .join("");
  const crawls = d.crawls
    .map(
      (c) =>
        `<article><h3>${esc(c.site.label)} · ${esc(c.state)}</h3><p>${c.rows.length} collected URLs. ${esc(c.error || "")}</p><p>${link(`crawl-${c.site.id}.json`, "All URL results, repeat probes and coverage")}</p><p>Limits: ${esc(c.coverage?.limits?.join("; ") || "none reported")}. Errors: ${esc(c.coverage?.errors?.join("; ") || "none reported")}. Pending URLs: ${c.coverage?.pending?.length ?? "unknown"}. Exclusions: ${esc(JSON.stringify(c.coverage?.exclusions || {}))}.</p>${table(
          "Reported cache state and final-hop first-byte timing",
          ["Header state", "Median (range) ms / samples"],
          Object.entries(c.cacheGroups || {}).map(([state, s]) => [
            esc(state),
            range(s),
          ]),
        )}${
          c.rows.some(
            (r) =>
              r.collection !== "ok" ||
              r.status >= 400 ||
              (r.repeat && r.repeat.state !== "complete"),
          )
            ? table(
                "Incomplete or failed URL observations",
                ["URL", "First collection", "Repeat probe"],
                c.rows
                  .filter(
                    (r) =>
                      r.collection !== "ok" ||
                      r.status >= 400 ||
                      (r.repeat && r.repeat.state !== "complete"),
                  )
                  .map((r) => [
                    esc(r.url),
                    esc(
                      r.error ||
                        `HTTP ${r.status ?? "unknown"} · ${r.collection}`,
                    ),
                    esc(r.repeat?.error || r.repeat?.state || "not scheduled"),
                  ]),
              )
            : ""
        }<p>Changed HTML bodies on repeat: ${c.rows.filter((r) => r.repeat?.sameBody === false).length}. Groups include observed response statuses and first/repeat requests; inspect per-URL status and body hashes before comparing. “Not reported” is unknown. Repeating a URL does not prove a cache hit; no query string is assumed to bypass a cache.</p></article>`,
    )
    .join("");
  const body = `<main><h1>${esc(d.project.name)} — Maximum site check</h1><p>${esc(d.state)} collection · ${esc(d.startedAt)}</p><p>${esc(d.profile.question)}</p>${d.failure ? `<p class="notice">${esc(d.failure)}</p>` : ""}<section><h2>Numbered findings</h2>${d.findings.map((f) => `<article><h3>${f.number}. ${esc(f.title)} — ${esc(f.label)}</h3><p>${esc(f.detail)}</p><p>${esc(typeof f.limitations === "string" ? f.limitations : JSON.stringify(f.limitations))}</p><p>${f.evidence.map((file) => link(file)).join(" · ")}</p></article>`).join("")}</section><section><h2>Crawl and cache state</h2><p>Crawl depth ${d.profile.crawl.depth}; URL limit ${d.profile.crawl.maxUrls}; sitemap limit ${d.profile.crawl.maxSitemaps}. Completion refers to this bounded discovery scope. A limit or source failure remains partial.</p>${crawls}</section><section><h2>Timed public journeys</h2><p>Ready time ends when the expected element is visible, fonts are loaded and visible images are complete. These are instrumented local browser observations. Observed LCP/CLS are snapshots at readiness, not visitor Core Web Vitals or interaction latency. SPA navigation metrics can belong to the original document.</p>${observations}</section><section><h2>Interleaved experiments and layout parity</h2><p>Fresh browser contexts and disabled browser cache apply to every variant. Order alternates by repetition; origin/CDN caches may be primed. Full performance traces are retained for every sample. No production changes are applied. No automatic finding claims that a fix is proven. Parity covers only the configured selectors, document height and unmasked viewport pixels; it does not establish functional equivalence.</p>${experiments || "<p>No experiment configured; cause remains unresolved.</p>"}</section><section><h2>Evidence map</h2><p>${link("evidence-map.json", "Machine-readable evidence map")} · ${link("profile.json", "Investigation profile")} · ${link("conditions.json", "Conditions and collector hashes")} · ${link("results.json", "All results")}</p><details><summary>${d.evidenceMap.length} evidence files and hashes</summary>${table(
    "Evidence files",
    ["File", "Kind", "SHA-256"],
    d.evidenceMap.map((a) => [link(a.file), esc(a.kind), esc(a.sha256)]),
  )}</details></section><footer><p>Confirmed findings describe directly recorded facts. Strongly supported findings meet the explicit repeated-ablation and parity checks. Unresolved findings retain failed, confounded or insufficient evidence. This maximum tier answers an investigation question; minimal and standard remain separate checks. Only anonymous read-only pages were exercised.</p></footer></main>`;
  await writeFile(
    resolve(dir, "report.html"),
    reportDocument(
      `${d.project.name} — Maximum site check`,
      body,
      "main{overflow-wrap:anywhere}article{margin:16px 0}table{table-layout:fixed;min-width:650px}td:last-child{min-width:0}.filmstrip{display:flex;gap:12px;overflow-x:auto;max-width:100%}.filmstrip figure{margin:0;flex:0 0 180px}.filmstrip img{width:180px;height:140px;object-fit:contain;background:#eee}.filmstrip figcaption{font-size:13px}@media print{table{min-width:0}.filmstrip{flex-wrap:wrap;overflow:visible}.filmstrip figure{flex-basis:120px}.filmstrip img{width:120px;height:90px}section{break-before:auto}}",
    ),
  );
}
