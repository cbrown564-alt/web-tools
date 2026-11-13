# Page inventory verification — 12 November 2026

This record describes the phase 3 manual prototype. [PRODUCT.md](../PRODUCT.md) owns intended behaviour; [README.md](../README.md) owns operation and scope; [plan.md](plan.md) owns phase status and acceptance. No source website was changed.

## Collector and reference evidence

The two completion commands use the same collector SHA-256, `1f073107c362ac600b0f3bd466266e0c8958b0de3c9e57c6c0f09ce889b9c576`:

```sh
PROJECT=london-potters npm run inventory -- --captures representative --run 2026-11-12-inventory-verified
PROJECT=elizabeth-norman npm run inventory -- --captures representative --run 2026-11-12-inventory-verified
```

Both use link depth 2, up to 2,000 URLs and 40 sitemap documents, two HTTP workers with request starts at least 250ms apart, and both recorded devices. Historical URLs are additional seeds. `inventory.json` is the per-site machine-readable result; conditions, source hashes, progress, reconciliation, screenshots and report remain in each evidence folder. The generated per-site index records the chosen run's state and inventory hash.

The historical URL sets are kept in each project's `inventory-history.json`, with source path, date and SHA-256. London Potters is the 1,186-row public census from 5 November (`docs/evidence/2026-11-05/completion/census.jsonl` in that repository). Elizabeth Norman is the 176-row review catalogue checked on 10 September (`review/src/catalogue.json` in the Liz repository). Only URL sets and provenance were extracted; earlier scripts were read as references, not run against production. The collector does not read the CRM, user enumeration or application data queried by the broader historical Liz probe.

## Elizabeth Norman results

The completion inventory contains **221 URLs**, collected in 212.0 seconds. All requested HTTP observations completed. There are 53 unique URLs in today's sitemaps: 32 posts, 11 pages and 10 job listings. Fourteen full-page captures succeeded: seven selected pages on desktop and mobile, with no failed captures. The report and the pointer are complete for this explicitly representative scope.

The old catalogue's 176 URLs reconcile as follows:

| Historical final HTTP outcome | URLs |
| ----------------------------- | ---: |
| HTTP 200                      |  105 |
| HTTP 410                      |   58 |
| HTTP 404                      |   11 |
| Excluded query-form job URL   |    1 |
| Excluded logout action        |    1 |
| Total                         |  176 |

The additional 47 URLs come from current sitemap/link discovery. Counts are URL observations, including redirects, aliases and error responses. Among all successful rows there are 73 distinct final destinations; 221 is not a claim of 221 distinct live content pages. The excluded historical URLs and their reasons are listed in `reconciliation.json`. The smaller current sitemap and the directly observed 410/404 responses explain the difference from the September catalogue without assuming that every missing sitemap entry was deleted.

## London Potters results

The run finished in **982.9 seconds**, with **1,155 observed URLs** and 795 unique normalized sitemap URLs. All queued URLs were attempted; neither the URL nor sitemap cap was reached. It remains **partial**, preserving eight stopped redirect observations and five failed selected captures.

The 1,186 historical URLs reconcile exactly: 1,149 were collected and 37 dated calendar-generator URLs were excluded by the new finite crawl rule. Six additions give 1,155 rows: four profile URLs (`brenda`, `jonathan-williams`, `rebecca`, `valmai-barclay`), `/members-resources/`, and `/discipline/interior-design/page/7/`. These are additions to the observed URL set, not a claim that all six pages were newly published. The current profile sitemap has 446 entries against the historical 443.

Final HTTP outcomes among historical rows are 1,135 HTTP 200, one 403, five 404 and eight incomplete redirect observations. All six added rows returned 200, giving 1,141 successful rows overall. Supplemental anonymous checks confirm the eight incomplete rows redirect to `wcm_redirect_to` / `wcm_redirect_id` query URLs, which the conservative redirect/query rule rejects. Those destinations were not followed and no login was attempted. The diagnostic chains are in `output/verification/inventory/blocked-redirects.json`. The failed responses and blocked redirects were not silently counted as healthy pages.

Fourteen pages were selected on two devices. **23 of 28 captures succeeded**. The gallery exceeds capture bounds on desktop (24,023px at 1,440px wide, above 24 million pixels) and mobile (85,987px, above 50,000px). Three mobile captures (`join-london-potters`, `members-hub`, `resource-center`) reported unsettled images. A supplemental fresh-context retry succeeded for Join and Resources; Members Hub still failed its image-settling check. These retries are recorded separately in `output/verification/inventory/recheck/` and do not rewrite the original run. No truncated gallery or fabricated blank page was saved. All saved captures and the visible failure cards were inspected in a contact sheet.

The early interrupted `2026-11-12-inventory-acceptance` folder is scratch progress, not completion evidence. The selected `inventory/before.json` pointer identifies the full finished run and retains its partial state.

## Browser and operational checks

The representative Elizabeth Norman slice first proved the complete collection/report loop before the larger runs. Its 84 currently discoverable URLs and 14 captures completed; historical seeding was then added for direct reconciliation. The complete 221-URL report was also opened offline, and all fourteen selected captures were visually inspected in a contact sheet. Desktop 1440×1050 and mobile 390×844 checks cover page search, clearing the filter, relative evidence links, overflow, uncaught errors and axe WCAG 2/2.1 A/AA checks. A long sitemap URL initially overflowed on mobile; report text now wraps and the repeat checks passed.

A deliberately limited one-URL run exercises the side-by-side sheet against a finished inventory of the same site. It remains labelled partial because its URL cap was reached. Prior images are copied with hash verification into the new folder, preserving portable links. The selected index was restored to the full 221-URL run after this layout check. The sheet passed desktop/mobile link, image-load, filter, overflow and axe checks. A two-page print preview was rendered and inspected. No external competitor was chosen or crawled; competitor selection and invalid configurations have automated coverage.

Focused tests cover nested sitemaps, redirects, robots exclusions, unsafe/action/query exclusions, decoded byte counts, URL limits, historical orphan seeds, exact reconciliation, HTML/technology/form parsing without field values, competitor configuration, full-page captures on both devices, provenance hashes, blocked POST requests and an HTTP capture failure. Full repository checks passed for Research Network and London Potters, including comparison builds and browser edit/import/reset/PDF recovery flows. Six final desktop/mobile report checks passed with zero axe violations, working filters and local links, and no page-level overflow or uncaught errors (`output/verification/inventory/results.json`). The original full runs had 25 tests; the later competitor test also passed in the five focused inventory tests. `npm audit --audit-level=low` found zero vulnerabilities. `git diff --check` passed. Source and inventory evidence scans found no local PageSpeed key; environment files, generated evidence and per-site index folders are ignored by Git.

## Scope and limits

The live runs use **representative captures**, not photographs of every inventoried URL. All-page capture is implemented as the default command mode and the browser collector is exercised directly in tests; it was not run across the entire London Potters catalogue. This distinction is visible in the reports and current index metadata. Template groups are coarse inferences from body classes or explicit project URL rules, not an authoritative CMS template catalogue.

The crawl reads HTTP HTML, so JavaScript-only links and forms may be absent. Versions taken from asset query strings are asset labels, not verified installed plugin versions. Tracker markers are presence evidence, not proof of delivery. Form values are not retained and forms are not submitted; browser captures block non-GET/HEAD requests. No login credentials or PageSpeed key are needed. Full-page captures keep the existing 50,000px / 24-million-pixel / 150-scroll-step bounds and record failures rather than truncating screenshots. Old evidence is never overwritten. An interrupted command leaves unfinished progress rather than a finished inventory claim.
