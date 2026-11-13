# Site check verification — 12 November 2026

Phase 1 is implemented and verified as a local command, with raw evidence and rebuildable HTML reports. All phase acceptance criteria are met and the plan is marked **Working**. The runs retain source-site failures as findings. No client validation, source-site remediation or public deployment is claimed.

## Scope

- London Potters and Research Network use their existing paired comparison records.
- Velocity and Red Thread (`unitedstats`) use live-site records, following the owner's instruction to check only the live websites. Each has five representative pages and desktop/mobile viewports. Velocity's separate research app is excluded.
- Minimal uses the PageSpeed Insights key from local `.env`. The owner supplied an RTF file; it was converted to plain text without printing the key. Both filenames are ignored. API requests send the key in a header; no key is added to URLs, reports or browser bundles.
- Standard uses local Lighthouse, with three fresh-browser runs per available page/device and rotated site order. HTTP-only checks are recorded once per URL rather than duplicated by device.

## Initial live runs

| Project          | Tier     | Result                                                                                                                                                                       |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| London Potters   | Minimal  | 140.8 seconds; all 20 page/device/site availability checks succeeded; 20 PageSpeed results, 10 cache pairs, and accessibility/security/discovery results.                    |
| Research Network | Minimal  | 95.1 seconds; four page/device combinations skipped because the current Events and Gallery pages have no visible main heading; the remaining 12 PageSpeed results completed. |
| Velocity         | Minimal  | 74.5 seconds; all ten page/device checks succeeded, with ten PageSpeed results.                                                                                              |
| Red Thread       | Minimal  | 55.8 seconds; all ten page/device checks succeeded, with ten PageSpeed results.                                                                                              |
| London Potters   | Standard | 771.1 seconds; 60 Lighthouse audits and 20 cold/repeat browser-load pairs completed; all available module collections succeeded.                                             |

Evidence is stored locally in ignored `projects/<id>/evidence/2026-11-12-<tier>/`. Saved conditions include tool/browser versions, machine details, viewport, throttling and sampling limits. No measurements are mixed across run folders. The earlier London Potters gallery cache slice is retained separately.

## Final acceptance series

All six runs use collector SHA-256 `9dca13c12f6186649f84e17a7394baf2e76a2ec782c29c69c810a90e9cfcf4f3`. Every conditions file records the digest and its source-file/lockfile hashes. The collector did not change between projects or tiers. Every saved performance summary was checked against its raw audit; all 148 summaries match. Each of the 32 available standard page/device/site groups has exactly three Lighthouse audits and one cold/repeat load pair.

| Project          | Tier     | Seconds | Collection | Evidence                                                                                                                                      |
| ---------------- | -------- | ------: | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| London Potters   | Minimal  |   150.9 | partial    | All 20 availability checks and PageSpeed tests completed; one uncached gallery request exceeded the fixed 15-second timeout.                  |
| Research Network | Minimal  |    85.2 | partial    | Four missing-heading page/device combinations skipped; 12 PageSpeed tests completed.                                                          |
| Velocity         | Minimal  |    70.3 | complete   | All ten page/device checks and PageSpeed tests completed.                                                                                     |
| Red Thread       | Minimal  |    60.0 | complete   | All ten page/device checks and PageSpeed tests completed.                                                                                     |
| London Potters   | Standard |   740.1 | complete   | 60 Lighthouse audits, 20 cold/repeat pairs and all cache requests completed without collection errors.                                        |
| Research Network | Standard |   398.5 | partial    | 36 Lighthouse audits and 12 cold/repeat pairs completed. Four availability skips and two additional cache sample skips; no collection errors. |

Runs are in `projects/<id>/evidence/2026-11-12-acceptance-<tier>/`; earlier evidence remains untouched. All minimal runs finished within five minutes. Velocity and Red Thread use the same live-site collector without a duplicated before/after target.

The minimal London Potters timeout remains recorded with partial measurements. Its subsequent standard run completed all 64 production cache requests: reported cache hits had a median of 138.9 ms and misses 1,562.3 ms. Research Network's extra cache sample skips are a missing heading at `/rl_gallery/5960/` and a 404 at the demo's `/home` URL. These are source findings, not unreported or replaced samples.

## Findings supported so far

The gallery cache slice reproduced London Potters' fast-cached/slow-uncached split: plain requests returned `X-Cache: HIT` at 113–149 ms; unique-query requests returned `MISS` at 5,977–8,498 ms. A unique query is not assumed to bypass caching; the report uses observed headers.

Google returned origin-level visitor data for London Potters, explicitly marked `origin_fallback`. The report identifies it as origin data, rather than claiming page-specific visitor measurements. The demos may have no visitor data; that is reported as unavailable, not a failed performance test.

The standard sitemap probe found 713 URLs in the bounded London Potters production sitemap read; it is not a complete inventory. The demo returned no usable sitemap. Sampling limits and incomplete coverage are retained in the results.

## Historical Lighthouse comparison

The historical reference is `~/code/london-potters/docs/performance-comparison-2026-11-08.html`; its underlying 54-audit snapshot is `docs/evidence/2026-11-08/performance-gateway/` in that repository. These are mobile medians from the final acceptance standard run, compared with the historical ranges:

| Page / site                  | Historical score range | Acceptance median score | Historical LCP range | Acceptance median LCP |
| ---------------------------- | ---------------------- | ----------------------- | -------------------- | --------------------- |
| Members gallery / production | 71–74                  | 75                      | 5.31–5.33 s          | 4.467 s               |
| Members gallery / EmDash     | 86–92                  | 100                     | 2.68–3.25 s          | 1.099 s               |
| Events / production          | 71–73                  | 71                      | 5.32–5.38 s          | 5.343 s               |
| Events / EmDash              | 85–87                  | 100                     | 3.09–3.40 s          | 1.667 s               |

Lighthouse is 13.6.0 in both series, but the browser changed from Chromium 151.0.7922.34 to 158.0.8127.18. The old EmDash comparison used a private, authenticated deployment with private/no-store caching; the current project record targets a publicly accessible demonstration with different observed cache responses. The live pages and their assets were not frozen across dates. Desktop viewport height also differs (900 then, 1050 now), although the mobile viewport remains 390 × 844 and the configured mobile throttling matches.

The raw audits now reconcile the out-of-range results:

- **Production gallery:** all three archived LCP nodes are Jack Durling; all three initial 12 November nodes are Natasha Ismail-Gomperts. The first archived image request transferred 172,241 bytes (171,544 bytes of resource); the newer image transferred 8,516 bytes (7,980 bytes of resource). The URLs identify different photographs. The historical LCP range therefore measures a different image, not a fixed regression reference for the current gallery.
- **EmDash gallery:** commit `05a1736` on 10 November deliberately added paged gallery browsing and optimised public-page delivery, after the historical benchmark. The EmDash owner (`~/code/london-potters/emdash/README.md`, “Verified performance outcome — 10 November 2026”) records 24 results per page and a subsequent 30-audit matrix scoring 100, with a different mobile viewport/DPR from this tool. The actual gallery audits fall from 4,201 DOM elements to 430. The pictured maker remains Jack Durling, but the image changes from the Astro `/_image?href=...` route to `/_img/400/profiles-import/...` and a new responsive source set. Its top edge moves from 729px to 675px, and audited requests fall from 17–18 to 11. This is a different delivered page and image-loading path, as well as a different access/cache environment.
- **EmDash Events:** the same exhibition image gains `fetchpriority="high"`; its top edge moves from 337px to 233px and its rendered dimensions change from 297 × 143 to 306 × 147. Audited requests fall from 39 to 12. The historical timing range belongs to the earlier rendering and loading behaviour.
- **Production Events:** the same LCP subject and geometry remain, and the initial 12 November score median and LCP rounded to historical precision fall inside the archived ranges.

These facts explain why the changed-page results are separate dated observations. They do not assign an exact number of milliseconds to each browser, content, delivery or authentication change. No particular repair is credited with a causal gain; that would need the experiments reserved for phase 6.

### Controlled replay

`scripts/reconcile-lighthouse.mjs` reads all 54 archived raw audits without network access and passes their metrics through the current `performanceSummary` and `aggregatePerformance` functions. It reproduces all 18 independently calculated historical groups: 360 count/median/minimum/maximum assertions pass across score, LCP, TBT, CLS and Speed Index. The saved reconciliation contains source-file hashes, per-run LCP nodes and settings, and URL-matched comparisons with the newer audits.

A portable regression fixture in `tests/fixtures/lighthouse-2026-11-08.json` retains the actual metric inputs, raw-source hashes and independent expected groups. `tests/lighthouse-history.test.mjs` repeats the check without requiring the other repository. This is a replay of recorded measurements, not a new run of the historical website.

The historical comparison criterion is met: the current summariser agrees with the fixed historical reference, and differences in live results have identified changes in what was measured. `projects/london-potters/evidence/2026-11-12-reconciliation-final/reconciliation.json` contains the checksummed reconciliation against the final acceptance series; `2026-11-12-reconciliation-reviewed/` retains the corresponding comparison with the initial 12 November series.

## Checks and visual review

- Focused tests cover options/project selection, single-site records, summary statistics, credential redaction, overwrite refusal, sitemap parsing, HTTP redirects and body limits, page failures, axe findings, keyboard menu recovery, repeat loads, API key handling and API quota errors.
- `npm run check` and `PROJECT=london-potters npm run check` passed after the live-site extension and report accessibility repair: 16 tests, production builds, capture checks and the existing comparison browser suites. `npm audit` reported zero known vulnerabilities.
- Minimal and standard HTML reports inspected at 1440px and 390px, including the single-site Velocity report. No viewport overflow. The first standard mobile scan found an unfocusable scrolling region; scroll regions were then made named, focusable regions. The final expanded mobile scan had no axe WCAG 2 A/AA or 2.1 A/AA violations, and a focused wide table scrolled with the keyboard.
- Printed the report with Chromium, rendered PDF pages with Poppler, and inspected the overview and a performance table. Print expands the evidence sections and restores their closed state afterward. All PDF pages have not been visually inspected.
- The final scan covered 420 evidence, report and static-build files and found zero occurrences of the API-key value. `.env` and `.env.rtf` are ignored and untracked. Every successful performance row links to an existing raw result, and every available standard page/device/site group has exactly three Lighthouse runs.
- Research Network’s standard report and Red Thread’s minimal report also passed offline desktop/mobile report checks with no viewport overflow or axe WCAG violations in the selected rule set. No source site or Google connection is needed to read the saved reports.

## Limits and source findings

No phase acceptance work remains. Standard live runs on Velocity and Red Thread are not required by the phase criteria and have not been performed; their minimal tier is verified. Source-site findings remain in the reports for follow-up. The final acceptance reports were opened offline at 1440px and 390px, including the cache-timeout and missing-heading cases; all six report scans had no viewport overflow or axe WCAG violations in the selected rule set.

Keyboard probes exercise recognised controls; visual focus and unrecognised menus need human review. No screen-reader user study or client review was performed. DNS checks use the site hostname (without `www`), not a guessed organisational domain; DKIM is untested without a selector. No forms were submitted, no source sites were modified, and no report was published.
