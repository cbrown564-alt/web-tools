# wt site-check

```
wt site-check <project> [options]
```

Check performance, cache, accessibility, security and discovery.

| Option                                | Meaning                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--tier <minimal\|standard\|maximum>` | Depth of the site check. Default: `minimal`                                                                  |
| `--modules <name[,name]>`             | performance, cache, accessibility, security, discovery                                                       |
| `--site <id[,id]>`                    | Site to use: before, after, live or a competitor id                                                          |
| `--pages <id[,id]>`                   | Limit to these recorded pages                                                                                |
| `--devices <desktop,mobile>`          | Limit to these devices                                                                                       |
| `--profile <file>`                    | JSON profile that configures this run                                                                        |
| `--run <name>`                        | Name the run this command creates, or choose the run it acts on. Default: the next number, or the latest run |
| `--render [run]`                      | Rebuild a saved report without measuring. Default: latest                                                    |

Status: minimal and standard are working. Maximum is a bounded investigation prototype with real runs on Velocity live and the Research Network demonstration.

## Run a site check

```sh
wt site-check london-potters
wt site-check research-network --tier standard --modules performance,cache
wt site-check velocity
wt site-check unitedstats
```

The site checker reads the project records. London Potters and Research Network have paired comparison records (version 1). Velocity and Red Thread (`unitedstats`) have live-site records (version 2), with one site and no invented before/after pair. Velocity covers its public website, not the separate research app. Live-site records work with `site-check`; comparison builds require paired pages and captures. [project.md](project.md#project-record) describes both record versions.

### The PageSpeed key

Minimal performance checks use Google PageSpeed Insights. Put `PAGESPEED_INSIGHTS_API_KEY=your-key` in a plain-text `.env` file at the repository root (see `.env.example`). The CLI loads it automatically; `.env` and `.env.*` are ignored by Git. The key stays in the local command and is sent only to Google, in a request header. Never give it a `VITE_` prefix, which would expose it to browser code.

Without a key, a minimal run checks everything except performance. The command prints that it is doing so and the report states that performance was not measured. Naming `performance` explicitly in `--modules` without a key is an error, with `Next: wt doctor`.

### Tiers

Minimal collects one PageSpeed Insights test per available page/device, paired cache timings, axe accessibility results, security headers/HTTP redirects and discovery metadata. Standard uses three serial local Lighthouse runs with rotated site order and median/range results, cold/repeat browser transfers, bounded sitemap cache samples, keyboard probes, form destinations, TLS/email records, sharing metadata and internal-link checks. Standard performance uses the project viewport; PageSpeed uses Google's own mobile/desktop presets, saved in the evidence. Neither tier submits forms.

### Scope and run names

Use `--pages home,gallery` or `--devices mobile` for a smaller run; omitted filters cover every recorded page and device on both sites. Use `--site after` to check only one side of a paired record. Runs are named automatically, `<date>-site-check-NN` (for example `2026-11-13-site-check-01`). `--run <name>` chooses a name explicitly and refuses any existing folder. A page that fails availability checks (including a missing visible main heading) is skipped and reported.

### Output

Each run writes ignored local files under `projects/<id>/evidence/<run>/`: `report.html`, `results.json`, `conditions.json`, and full performance results. Open the report locally or serve that folder with a static server. Its evidence links are relative, and the report can be printed to PDF. The report opens with what was checked, what was found and what needs a decision.

Rebuild a report without network requests:

```sh
wt site-check london-potters --render
wt site-check london-potters --render 2026-11-13-site-check-01
```

Bare `--render` rebuilds the latest site-check or maximum run. A value is a run name, not a folder path.

### Exit codes

0 means collection completed, not that the site has no problems; 2 means partial collection; 1 means setup or runner failure. Maximum shares these codes.

### Limits

Reports record collection failures, automated findings and checks needing review. Keyboard probes support recognised skip links and menu toggles; visual focus and unrecognised interactions still need human review. Sitemap sampling is limited to six XML documents and twelve URLs per site, and discovery tests at most fifty internal links per page. DNS checks use the exact site hostname with `www` removed; preview domains may not send email. DKIM needs a known selector and is reported as untested. Real visitor data is included when Google returns it; missing data is not a failure, and Google plans to remove it from this API. No CrUX integration is implemented yet. [Site-check verification](../verification-site-check-2026-11-12.md) records the accepted runs, historical reconciliation, report review and known limits.

## Investigate with the maximum tier

Maximum answers a named performance question. It uses an investigation profile rather than running the standard checks more often; `--modules` is not accepted for this tier. The supplied profiles test an observed font request as a **browser-only diagnostic ablation**, not a proposed production removal:

```sh
wt site-check velocity --tier maximum
wt site-check research-network --tier maximum --site after
```

The second command checks the Research Network demonstration only. Velocity remains live-only. Neither command creates a before/after pair or changes a website. Maximum runs locally in Chromium and does not call PageSpeed Insights, so it does not need the API key. Avoid running concurrent audits or heavy builds while collecting comparative timings. Runs are named `<date>-maximum-NN`.

The default profile is `projects/<id>/maximum.json`; use `--profile <file>` to choose another. Its project ID must match. `--site` must retain every site named by an experiment. `--devices mobile` restricts browser samples, while the crawl remains one HTTP collection per selected site. Journey pages come from the profile, so `--pages` is refused. `--profile` requires `--tier maximum`.

### Profile

A minimal profile shape is:

```json
{
  "version": 1,
  "projectId": "velocity",
  "question": "What contributes to homepage-to-gallery readiness?",
  "repetitions": 3,
  "crawl": { "depth": 2, "maxUrls": 2000, "maxSitemaps": 40 },
  "journeys": [
    {
      "id": "home-gallery",
      "label": "Open the gallery",
      "steps": [
        { "page": "home", "ready": "h1" },
        {
          "page": "gallery",
          "via": "a[href='/gallery.html']:visible",
          "ready": "h1"
        }
      ]
    }
  ],
  "parity": {
    "selectors": ["h1", "header", "main"],
    "maxGeometryDeltaPx": 1,
    "maxPixelChangeRatio": 0.001
  },
  "experiments": []
}
```

An empty experiment list is allowed and leaves cause/fix unresolved. Each step names a recorded project page and an expected visible element. Without `via`, the browser navigates directly; with it, the selector must choose a same-tab anchor whose destination matches the recorded next page. There is no arbitrary script, form submission, input typing or general button-click action. Use precise readiness selectors for the actual content being investigated; a heading alone is a limited check.

### Experiments

An experiment names a journey, a question and explicit effect thresholds. **Ablation** suppresses exact resource URLs/types in candidate samples of the same recorded site:

```json
{
  "id": "primary-font",
  "kind": "ablation",
  "site": "live",
  "journey": "home-gallery",
  "question": "Does this observed font request contribute to readiness?",
  "block": [
    { "url": "https://example.com/observed-font.woff2", "type": "font" }
  ],
  "minEffectMs": 100,
  "minEffectRatio": 0.1
}
```

Replace the example URL with an exact request observed on the chosen site; the supplied profiles contain the requests observed during preparation. Missing or changed assets must leave the intervention unproven. Resource types are `script`, `stylesheet`, `font` or `image`; documents cannot be ablated. **Comparison** instead names `"kind": "comparison", "baselineSite": "before", "candidateSite": "after"`, with the same journey/question/threshold fields and no block list. Both sites must exist in the selected record. A deployment comparison retains content/code/cache confounding and cannot automatically establish a cause.

### HTTP collection

The HTTP collector reuses inventory discovery and exclusions: robots, sitemaps and ordinary links within the configured depth, with action/export/sensitive-query and unbounded calendar URLs excluded. It attempts every discovered in-scope URL up to the stated bounds, rather than the standard tier's twelve-URL sample. Successful HTML URLs get a repeat probe with response headers, final-hop first-byte time and body hash. This timing excludes crawler pacing but is not a browser navigation time. Cache groups retain reported header states; missing headers mean unknown. A repeated URL is not assumed to hit cache. Limits, pending URLs, failed pages and changed bodies remain visible. An HTTP 429/503 stops remaining work; unavailable robots or source pages remain failures.

### Browser samples

Browser observations precede experiments. A failed initial journey prevents repeating that journey as an experiment. Every experimental repetition alternates order (baseline/candidate, candidate/baseline, baseline/candidate); repetitions are 3–9. Every sample uses a fresh context, disabled browser HTTP cache, blocked service workers/WebSockets, the recorded viewport, reduced motion and no imposed CPU/network throttling. Non-GET/HEAD browser requests and off-journey top-level navigation are blocked. Origin/CDN caches can still be primed by earlier requests.

Ready time is the **sum of step initiation-to-readiness times**: expected element visible, fonts loaded and visible images complete. It excludes evidence writing between steps and includes scrolling/click overhead when a link is used. All samples retain Chrome performance traces with timeline, V8 profiling, loading and actual screenshot events. Tracing adds overhead. Observed LCP/CLS stop at readiness, and SPA navigation metrics can refer to the original document; these are not field Core Web Vitals, INP measurements or mobile-hardware timings.

### Parity

Parity compares selected element counts, tag/text identity, geometry, document height and unmasked viewport PNG pixels at every step. The pixel comparison uses pixelmatch threshold 0.1 plus the profile's maximum changed-pixel ratio. Missing selectors, changed counts/content, over-500-element truncation, dimensions or tolerances fail parity. This proves only the selected coverage, not full-page or functional equivalence. Font suppression can change layout; such a result cannot qualify as a clean improvement.

### Findings

Reports contain numbered **confirmed**, **strongly supported** or **unresolved** findings. Confirmed describes directly collected facts. Strongly supported requires all alternating pairs, positive effect thresholds met on every pair, the resource observed successfully in each baseline and blocked in each candidate, and every parity check passing. It supports the narrow ablation result, not production removal or a proven deployable fix. Variable, incomplete or confounded results remain unresolved. A complete collection can still have unresolved findings.

### Evidence

Each immutable evidence folder contains `profile.json`, `conditions.json`, `results.json`, per-site crawl JSON/progress, per-sample network/step results, viewport captures, Chrome trace JSON and up to 24 genuine trace filmstrip frames with timestamps. `evidence-map.json` records file hashes; reports link every artifact and expose first-pair filmstrips. Traces stop at a 100 MB limit or reported event loss with a partial result. Open a downloaded performance trace in the local Chrome DevTools Performance panel. Keep traces, captures and reports together as internal public-page evidence; review them before sharing. `wt site-check <project> --render [run]` also recognises maximum runs and makes no requests. The evidence map identifies files relative to the saved run; it is not a signed attestation.

Maximum shares the site-check exit codes: **0** collection complete, **2** partial, **1** setup/runner failure. [Maximum-tier verification](../verification-maximum-2026-11-12.md) records the controlled fixture, real runs and coverage limits.

## Reconcile the historical benchmark

`conditions.json` includes a SHA-256 digest of the collector files and dependency lockfile. Matching digests prove that runs used the same collector; project URLs, settings and page content still need to be compared separately.

The London Potters reconciliation is an offline replay. It reads the archived 54 Lighthouse audits, runs the current summariser, and checks its medians/ranges against the independent archived summary. URL-matched mobile results retain LCP element names, geometry, image markup, candidate image request sizes, request counts and conditions. It never requests a website or changes the archive. It is a separate script, not a `wt` tool:

```sh
node --env-file-if-exists=.env scripts/reconcile-lighthouse.mjs \
  --historical ../london-potters/docs/evidence/2026-11-08/performance-gateway \
  --current projects/london-potters/evidence/2026-11-12-acceptance-standard \
  --output projects/london-potters/evidence/reconciliation-new
```

Choose an unused output folder. The saved JSON records source hashes and passed replay assertions. A changed LCP photograph or image delivery path makes the historical score range a different observation; it cannot establish the effect of a particular repair. The dated verification record owns the reconciliation conclusion.
