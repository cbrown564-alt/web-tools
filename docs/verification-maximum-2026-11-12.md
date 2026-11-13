# Maximum site-check verification — 12 November 2026

This record describes phase 6's bounded manual prototype. [PRODUCT.md](../PRODUCT.md) owns intended behaviour; [README.md](../README.md) owns commands, profiles and operating limits; [plan.md](plan.md) owns phase status. No production optimisation or deployment was applied.

## Controlled representative slice

`tests/fixtures/maximum-server.mjs` serves two labelled synthetic pages, a deliberately delayed script, a real gallery navigation link, a small image, a sitemap and explicit cache headers. An attempted POST is blocked by the browser harness. The maximum collector traverses the pages, repeats HTTP probes, measures the actual link journey and alternates three baseline/candidate pairs. The candidate suppresses only the delayed script request, whose presence is independently checked in baseline network evidence.

The injected delay produces a repeatable improvement with matching selected element identity/counts/geometry, document height and viewport pixels. The report labels this narrow ablation result **strongly supported**, never a deployable fix. Every sample retains a parseable Chrome trace with timeline events, V8 Profile/ProfileChunk events and actual Screenshot events, plus extracted timestamped JPEG filmstrips. All evidence-map hashes were checked against bytes on disk.

Negative checks reject foreign profiles, unsafe asset credentials/types, duplicate block rules, invalid limits, insufficient repetitions, missing interventions, non-finite or inconsistent timings, incorrect order, partial pairs and changed layouts. Missing/count/content/geometry/truncation and pixel differences fail parity. An incorrect link destination is refused before clicking, retains its trace, and produces a partial journey. A separate HTTP 503 fixture stops remaining work and retains a partial HTML report. Reusing an evidence folder is refused. No fixture POST reached the server.

## Two real project collections

Both were run sequentially, with no simultaneous browser audits or builds, using collector SHA-256 `b98abffc87a3b887634172d50f7eec0b09272d57c2325f6a07d71640b9c5fe93` and unchanged measurement code between projects:

```sh
PROJECT=velocity npm run site-check -- --tier maximum --sites live --run 2026-11-12-maximum-verified
PROJECT=research-network npm run site-check -- --tier maximum --sites after --run 2026-11-12-maximum-verified
```

| Project          | Site  | URLs collected | Successful HTML repeat probes | Journey samples | Chrome traces | Collection |
| ---------------- | ----- | -------------: | ----------------------------: | --------------: | ------------: | ---------- |
| Velocity         | live  |             85 |                            69 |              14 |            14 | complete   |
| Research Network | after |             49 |                            48 |              14 |            14 | partial    |

Each site uses depth 2, a 2,000-URL limit and a 40-sitemap-document limit. Neither run hit a limit or left queued URLs. This is complete discovery within those bounds and the shared inventory exclusions, not a promise to enumerate every possible dynamic URL. Crawls were fresh HTTP collections; historical inventory seeds were not substituted. HTTP headers, final-hop TTFB, repeat responses and body hashes remain available per URL.

Velocity collected 85 URLs and repeated 69 successful HTML documents. Research Network's demonstration collected 49 URLs, repeated 48 successful HTML documents, and retained **HTTP 404 at `/home`**. Its discovery queue completed, but that failed page keeps the overall collection **partial**. The report exposes the failed URL directly; it is not reclassified as a successful check. Research Network's live WordPress site was outside this explicit `--sites after` run. Velocity remains live-only; no before/after site was invented for it.

Both desktop and mobile home-to-gallery journeys completed. Each project has two initial observations and twelve experimental samples, giving **28 complete journey samples and 28 traces** across the two projects. Every experiment has three alternating pairs per device. The experiments suppress exact font URLs observed during preparation; they do not change either server or propose a font removal for production.

| Project          | Device  | Baseline median ready ms | Candidate median ready ms | Median paired savings ms | Cause/fix assessment |
| ---------------- | ------- | -----------------------: | ------------------------: | -----------------------: | -------------------- |
| Velocity         | desktop |                   2137.3 |                    3030.6 |                   -727.1 | unresolved           |
| Velocity         | mobile  |                   2524.2 |                    2136.9 |                    -19.6 | unresolved           |
| Research Network | desktop |                   2096.8 |                    2124.9 |                    -28.1 | unresolved           |
| Research Network | mobile  |                   4132.8 |                    3039.8 |                   -435.7 | unresolved           |

Medians of per-pair differences are reported separately from differences between the two medians. All four real assessments remain **unresolved**: interventions matched, but parity failed and gains were inconsistent. A smaller candidate median in one group is insufficient evidence. These runs provide no basis for declaring a performance fix proven or recommending production font removal.

## Presentation and raw evidence

Each run is under `projects/<id>/evidence/2026-11-12-maximum-verified/`, with profile, conditions, per-site crawl/progress, per-sample results, Chrome trace JSON, viewport captures, trace filmstrips, an evidence map and report. Findings link their supporting measurements; the evidence map records artifact hashes. Traces are capped at 100 MB, with missing filmstrips or reported event loss treated as partial. The real runs retained their traces and filmstrips successfully.

After collection, the shared report renderer was refined offline to expose failed URL rows and display CLS/pixel/geometry values with useful precision. Raw results and collection conditions were preserved. Each run's `report-render.json` records the original collection renderer hash, current renderer hash and results hash; this presentation-only rebuild did not remeasure either site. The final renderer SHA-256 is `92ba64f3c652d708d47ecde9d723cab16e6efd95e82b46ea4dcf157188dff332`. A final failure-reporting correction in `maximum.mjs` distinguishes configured-but-unrun experiments from an empty experiment list after a source stop; the HTTP 503 regression test verifies that distinction. Current source differs from collection only in this failure-reporting branch and the report renderer. All browser measurement, crawl, profile-validation, experiment and parity code remains unchanged.

## Checks

- Five maximum-tier tests passed; the complete repository has **45 tests**. The repository's documented `npm run check` and `PROJECT=london-potters npm run check` passed, including production builds and comparison browser workflows. The former unsupported-maximum assertion now checks an unknown tier instead.
- The synthetic report and both real reports were opened offline at desktop 1,440px and mobile 390px, with all filmstrips loaded: zero axe WCAG 2/2.1 A/AA violations, no page-level horizontal overflow or uncaught errors, and all local evidence links resolved. Screenshots and ordinary browser print PDFs are under ignored `output/verification/maximum/`.
- Screenshots of findings, trace filmstrips, the failed `/home` observation and viewport/parity captures were visually inspected. Trace JSON structure, CPU profile and screenshot events were inspected; a manual DevTools trace-import session was not run.
- Every real evidence-map file hash was checked. The local PageSpeed key was checked for absence from maximum source/configuration and generated evidence without printing it. Generated evidence, output and `.env` remain ignored. Formatting and `git diff --check` passed.

## Limits and next use

The instrumented, unthrottled Chromium runs use this machine's connection and recorded desktop/mobile viewports. They are not independent mobile hardware runs, visitor Core Web Vitals, INP measurements or statistical population estimates. HTTP/browser caches differ, and earlier probes can prime origin/CDN caches. Reduced motion and blocked non-GET/HEAD traffic, service workers and WebSockets affect the observed experience and apply equally to both variants. Traces and checkpoints add overhead; timing values should not be compared directly with bare Lighthouse or field measurements.

Readiness ends at the configured visible selector, loaded fonts and complete visible images. It does not prove that every interaction works. Parity covers configured selectors, document height and viewport pixels; it cannot certify full-page, semantic or functional equivalence. Resource removal can affect later states. Deployment comparisons retain code/content/cache confounding and cannot automatically isolate a cause.

The complete causal workflow is proven on a controlled synthetic delay. The two real projects prove collection and conservative reporting; their font experiments do not establish an optimisation. The next real investigation should name an observed bottleneck, choose a single controlled change and test the affected behaviours before any production promotion. No live form submission, client code edit, Cloudflare deployment or staff message was performed.
