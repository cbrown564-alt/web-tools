import { normalize, hash } from "../inventory/core.mjs";
import { stats } from "./core.mjs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export function pageUrl(project, side, page) {
  const s = project.sites.find((s) => s.id === side),
    p = project.pages.find((p) => p.id === page);
  if (!s || !p) throw Error("Unknown investigation site or page");
  const u = new URL(p[`${side}Path`] ?? p.path, s.baseUrl);
  if (normalize(u.href, u.href, s.baseUrl).reason)
    throw Error("Journey page is not a safe public document");
  return u.href;
}
export function samePage(a, b) {
  const key = (value) => {
    const u = new URL(value);
    return `${u.protocol}//${u.hostname.replace(/^www\./, "")}:${u.port}${u.pathname.replace(/\/$/, "")}${u.search}`;
  };
  return key(a) === key(b);
}
export function validateMaximumProfile(p, project) {
  const fail = (message) => {
    throw Error(`Invalid maximum profile: ${message}`);
  };
  if (
    p?.version !== 1 ||
    p.projectId !== project.id ||
    typeof p.question !== "string" ||
    !p.question.trim()
  )
    fail("project identity and question required");
  const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  if (!integer(p.repetitions, 3, 9)) fail("repetitions must be 3–9");
  if (
    !integer(p.crawl?.depth, 0, 5) ||
    !integer(p.crawl?.maxUrls, 1, 10000) ||
    !integer(p.crawl?.maxSitemaps, 1, 200)
  )
    fail("explicit crawl bounds required");
  if (!Array.isArray(p.journeys) || !p.journeys.length || p.journeys.length > 8)
    fail("1–8 journeys required");
  const names = new Set(),
    slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  for (const j of p.journeys) {
    if (!slug.test(j.id || "") || names.has(j.id) || !j.label?.trim())
      fail("unique journey IDs and labels required");
    names.add(j.id);
    if (!Array.isArray(j.steps) || !j.steps.length || j.steps.length > 8)
      fail("1–8 steps required");
    for (const [i, s] of j.steps.entries()) {
      if (
        !project.pages.some((p) => p.id === s.page) ||
        typeof s.ready !== "string" ||
        !s.ready.trim()
      )
        fail("steps need a recorded page and ready selector");
      if (
        s.via !== undefined &&
        (i === 0 || typeof s.via !== "string" || !s.via.trim())
      )
        fail("via must select a link after the first step");
      for (const site of project.sites) pageUrl(project, site.id, s.page);
    }
  }
  if (
    !Array.isArray(p.parity?.selectors) ||
    !p.parity.selectors.length ||
    p.parity.selectors.length > 20 ||
    p.parity.selectors.some((s) => typeof s !== "string" || !s.trim())
  )
    fail("explicit parity selectors required");
  if (
    !Number.isFinite(p.parity.maxGeometryDeltaPx) ||
    p.parity.maxGeometryDeltaPx < 0 ||
    p.parity.maxGeometryDeltaPx > 20 ||
    !Number.isFinite(p.parity.maxPixelChangeRatio) ||
    p.parity.maxPixelChangeRatio < 0 ||
    p.parity.maxPixelChangeRatio > 0.1
  )
    fail("parity tolerances out of range");
  if (!Array.isArray(p.experiments) || p.experiments.length > 8)
    fail("experiments must be an array, at most eight");
  const experiments = new Set();
  for (const e of p.experiments) {
    if (
      !slug.test(e.id || "") ||
      experiments.has(e.id) ||
      !names.has(e.journey) ||
      !e.question?.trim()
    )
      fail("experiment identity/question/journey required");
    experiments.add(e.id);
    if (
      !Number.isFinite(e.minEffectMs) ||
      e.minEffectMs < 0 ||
      !Number.isFinite(e.minEffectRatio) ||
      e.minEffectRatio < 0 ||
      e.minEffectRatio > 1
    )
      fail("explicit effect thresholds required");
    if (e.kind === "ablation") {
      if (
        !project.sites.some((s) => s.id === e.site) ||
        !Array.isArray(e.block) ||
        !e.block.length ||
        e.block.length > 20
      )
        fail("ablation needs a recorded site and exact resource list");
      const urls = new Set();
      for (const b of e.block) {
        let u;
        try {
          u = new URL(b.url);
        } catch {
          fail("invalid resource URL");
        }
        if (
          !["http:", "https:"].includes(u.protocol) ||
          u.username ||
          u.password ||
          u.hash ||
          [...u.searchParams.keys()].some((k) =>
            /key|token|pass|auth|secret|email/i.test(k),
          ) ||
          !["script", "stylesheet", "font", "image"].includes(b.type) ||
          urls.has(b.url)
        )
          fail("exact non-sensitive asset URLs and types required");
        urls.add(b.url);
      }
    } else if (e.kind === "comparison") {
      if (
        e.baselineSite === e.candidateSite ||
        [e.baselineSite, e.candidateSite].some(
          (id) => !project.sites.some((s) => s.id === id),
        )
      )
        fail("comparison needs two distinct recorded sites");
    } else fail("kind must be ablation or comparison");
  }
  return structuredClone(p);
}

export function layoutParity(a, b, settings, imageA, imageB) {
  const reasons = [];
  let maxDelta = Math.abs(a.height - b.height);
  if (a.truncated || b.truncated)
    reasons.push("Selected element coverage was truncated");
  for (const sel of settings.selectors) {
    const x = a.groups[sel] || [],
      y = b.groups[sel] || [];
    if (!x.length || x.length !== y.length)
      reasons.push(`Missing or different element count: ${sel}`);
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      if (x[i].tag !== y[i].tag || x[i].textSha256 !== y[i].textSha256)
        reasons.push(`Different element content: ${sel} [${i}]`);
      for (let k = 0; k < 4; k++)
        maxDelta = Math.max(maxDelta, Math.abs(x[i].rect[k] - y[i].rect[k]));
    }
  }
  if (maxDelta > settings.maxGeometryDeltaPx)
    reasons.push("Geometry tolerance exceeded");
  const x = PNG.sync.read(imageA),
    y = PNG.sync.read(imageB);
  let ratio = null;
  if (x.width !== y.width || x.height !== y.height)
    reasons.push("Capture dimensions differ");
  else {
    ratio =
      pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0.1 }) /
      (x.width * x.height);
    if (ratio > settings.maxPixelChangeRatio)
      reasons.push("Viewport pixel tolerance exceeded");
  }
  return {
    passed: !reasons.length,
    maxGeometryDeltaPx: maxDelta,
    changedPixelRatio: ratio,
    reasons: [...new Set(reasons)],
    scope:
      "Configured selectors, document height and unmasked viewport pixels; not full-page or functional equivalence",
  };
}

export function assessExperiment(e, samples, repetitions) {
  const complete =
    samples.length === repetitions &&
    samples.every(
      (p, i) =>
        p.repetition === i + 1 &&
        JSON.stringify(p.order) ===
          JSON.stringify(
            i % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"],
          ) &&
        [p.baseline, p.candidate].every(
          (r) =>
            r?.state === "complete" &&
            Number.isFinite(r.readyMs) &&
            r.readyMs >= 0,
        ),
    );
  const values = samples
    .filter(
      (p) =>
        Number.isFinite(p.baseline?.readyMs) &&
        Number.isFinite(p.candidate?.readyMs),
    )
    .map((p) => p.baseline.readyMs - p.candidate.readyMs);
  const deltas = stats(values),
    baseline = stats(samples.map((p) => p.baseline?.readyMs)),
    candidate = stats(samples.map((p) => p.candidate?.readyMs));
  const parity = complete && samples.every((p) => p.parity?.passed);
  const intervention =
    e.kind === "ablation" &&
    complete &&
    samples.every((p) =>
      e.block.every(
        (b) =>
          p.baseline.requests.some(
            (r) =>
              r.url === b.url &&
              r.type === b.type &&
              r.status >= 200 &&
              r.status < 400,
          ) &&
          p.candidate.blocked.some((r) => r.url === b.url && r.type === b.type),
      ),
    );
  const repeatable =
    complete &&
    values.every((v) => v > 0 && v >= e.minEffectMs) &&
    deltas?.median >= baseline.median * e.minEffectRatio;
  const label =
    intervention && parity && repeatable ? "strongly supported" : "unresolved";
  return {
    label,
    baseline,
    candidate,
    pairedSavingsMs: deltas,
    complete,
    parity,
    intervention,
    repeatable,
    conclusion:
      label === "strongly supported"
        ? "Suppressing the named resource requests consistently shortened this instrumented journey without a detected parity change in the selected coverage. This is an ablation result, not a deployable fix."
        : "The evidence does not establish a cause or prove a fix. Review incomplete pairs, intervention matches, timing spread and parity differences.",
    limitations:
      e.kind === "comparison"
        ? "Different deployments can differ in content, code and cache state; this comparison cannot isolate a cause."
        : "Resource removal can affect untested behaviour. No production resource was removed. Browser/CDN state and trace overhead limit generalisation.",
  };
}
export { hash };
