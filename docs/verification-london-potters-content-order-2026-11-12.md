# London Potters content review and profile order — 12 November 2026

**Verified on the deployed demo: all 1,142 decided URL expectations pass, and profile ordering matches the captured live source.** All 446 gallery profiles and all 213 area/discipline archive pages match. The [19-case review](../projects/london-potters/evidence/2026-11-12-content-reconciliation/review.html) records live observations, demo behaviour and treatment for every previously undecided URL. Six decisions are resolved: the cart canonical redirect and the five user-confirmed archive decisions. Thirteen service/access decisions remain open. The final watch is quiet.

The [EmDash README](../../london-potters/emdash/README.md) owns migration scope and operation. This follows the [earlier URL repairs](verification-london-potters-url-fixes-2026-11-12.md); their historical evidence is unchanged.

## The nineteen decisions

| Group | URLs | Result |
| --- | ---: | --- |
| Existing canonical redirect | 1 | `/cart` returns 301 to `/cart/` on the source. Retained in the demo under the existing preservation policy; queries survive and non-GET/HEAD requests are excluded. The destination remains an inactive-service notice. |
| Cart/account/checkout services | 5 | `/cart/`, `/checkout/`, `/my-account`, `/my-account/` and `/my-account/lost-password/` remain undecided. Checkout redirects an anonymous empty-cart request to the cart; the no-slash account request returned 403. Login, recovery, authenticated and populated-cart behaviour require service decisions. The blocked response was recorded without bypass. |
| Event/product access | 8 | Six event URLs and two product URLs return 302 to home with `wcm_redirect_to` and original-content parameters. Their access/lifecycle treatment remains undecided. A temporary anonymous access response does not establish permanent consolidation or removal. The demo keeps labelled public calendar summaries or inactive-service notices. |
| Live 404s | 5 | User confirmed preserving Clare Gordon's dated archive at 200 and returning 404 for Remi, the old-website URL, the members-open-exhibition URL and the Design Trust members-news URL. Three of those four already returned 404. Only the Design Trust URL needs its generic inactive-service notice replaced by 404. No CMS record is deleted. |

No removal, 410 or permanent redirect was inferred from a failed/access-controlled source response. The four 404 decisions follow the user's explicit choice, recorded in [policy confirmation](../projects/london-potters/evidence/2026-11-12-content-reconciliation/policy-confirmation.json). The updated [decision JSON](../projects/london-potters/evidence/2026-11-12-content-reconciliation/decisions.json), [CSV](../projects/london-potters/evidence/2026-11-12-content-reconciliation/decisions.csv) and [URL map](../projects/london-potters/evidence/2026-11-12-content-reconciliation/redirect-map.json) retain the original 1,155-URL inventory identity. They contain 1,142 decided rules and thirteen holds. Fresh targeted observations are separate from the earlier partial inventory; this was not a replacement whole-site crawl.

The [decision editor](../projects/london-potters/evidence/2026-11-12-content-reconciliation/index.html) starts as a blank review, as designed. Import the supplied decision JSON to inspect the applied policy and thirteen remaining holds. Desktop/mobile import, filtering, CSV round-trip, accessibility and overflow checks passed. The separate nineteen-case report is readable as cards on mobile and a table on desktop.

## Ordering evidence and implementation

The unfiltered live gallery contains exactly the same 446 distinct profile URLs as the demo. Its order differs from the retained order; area/discipline archives also have their own source order. The first Central London trial matched all 55 source profiles across three pages before the pattern was applied to the remaining archive groups.

Source collection used anonymous GET requests with the existing `WebToolsInventory/1.0` identity and a 2.2-second pause between requests. All 213 planned archive pages returned 200. The source robots rules permitted these paths. Capture completed without HTTP 429; no alternate identity, proxy, login or form submission was used. The main gallery was captured at 20:37 UTC and checked again after the archive collection at 20:53 UTC; its ordered list was unchanged. Cache headers are retained, so this describes the live responses observed, including the source's cache state.

The compiler verifies every saved HTML hash, all 41 expected archive terms, consecutive pages, page sizes, duplicate-free profile lists, the full gallery membership and exact taxonomy membership against retained records. All checks passed. No profile content, taxonomy assignment, CMS record or media was imported or changed. Compared with the prior producer input and saved demo evidence, all 446 main positions and all 213 archive page slices changed; the profile set stayed the same.

The current order and gallery exclusions are in tracked `src/data/public-directory-order.json`; source URLs, capture times and hashes are in `src/data/public-directory-order-source.json`. Runtime ordering no longer reads the ignored order/exclusion files generated by the separate WordPress prototype. The main gallery retains twenty-four results per page; taxonomy archives retain twenty. Profile returns, history and no-JavaScript paging preserve their ordered results. Newly published native profiles absent from a capture remain visible after captured entries. Captured identifiers cannot create missing/private profiles.

The source snapshot supplies the unfiltered gallery order and each observed archive's order. Main-gallery filters retain that gallery's relative order. Future live ordering changes require a reviewed refresh; rendering makes no live WordPress request. To validate the saved evidence without writing files:

```sh
cd /Users/cobro/code/london-potters/emdash
node scripts/prepare-directory-order.mjs /Users/cobro/code/web-tools/projects/london-potters/evidence/2026-11-12-order-reconciliation/source-capture
```

Add `--write` to compile verified captures into the tracked data files. Membership or taxonomy drift stops compilation for review. The captured source and collection scripts are retained in [the evidence directory](../projects/london-potters/evidence/2026-11-12-order-reconciliation/).

## Deployment and checks

Final demo version: `73562d3b-7bdc-4f24-9202-ce2afe846aa4`. Ordering deployment `2a30a0a8-a8af-4b4b-a723-c20dee596c8c` first replaced `9ecc7100-46be-4be6-b770-8fdee55264f6`; the final deployment applies the user's missing-content decision. Target: [existing gallery](https://london-potters-emdash-demo.empty-union-f39d.workers.dev/members-gallery/) and [Central London page 2](https://london-potters-emdash-demo.empty-union-f39d.workers.dev/area/central-london/page/2/). Noindex, native administration sign-in and inactive services remain. There was no production cutover, schema migration, content import, account change or service activation. Public reads can populate the existing caches.

| Check | Result |
| --- | --- |
| Route/order/snapshot tests | 7 passed |
| Astro typecheck | 36 files; zero errors, warnings or hints |
| Build and Wrangler dry run | Passed; existing large-bundle advisory remains |
| Native migration preflight | No pending/unknown migrations; none executed |
| Source-order HTTP checks | 233 local and 233 hosted pages passed: the full gallery, nineteen gallery pages and 213 archive pages, including exact identities/order and profile return context |
| Content/filter sweep | 5,143 passed across 804 entry paths and 309 filter combinations |
| Existing hosted visitor suite | 96 passed, including images, artwork, error recovery and high-density image pixels |
| New hosted order journeys | Desktop/mobile passed main and archive paging, profile returns, browser history and no-JavaScript navigation |
| Archive/restored-profile browser checks | Passed; tested archive page has zero axe WCAG A/AA violations at desktop/mobile widths |
| Nineteen-case review | Desktop/mobile passed; nineteen cases, thirteen holds after JSON import, CSV round-trip, zero axe violations and no overflow |
| Updated full URL map | All [1,142 decided rules passed](../projects/london-potters/evidence/2026-11-12-reconciled-final-route-check/report.html) on the final deployment; thirteen holds remain |
| Confirmed missing URLs | Final deployment preserves Clare at 200 and returns 404 for the other four; slash/query variations and the neighbouring inactive members-news route were checked |
| Watch | [Final repeat is quiet](../projects/london-potters/evidence/2026-11-12-order-final-watch/report.html): ten identical captures, eighteen passing assertions, no new findings |

The first unchanged content sweep ended on a TLS connection EOF. It was rerun after the concurrent browser checks finished and passed all 5,143 checks; the transport failure log is retained. No content assertion was weakened or HTTP error converted into a pass. The older visitor harness still uses the previously documented import-only Puppeteer adapter. That full sweep and the browser suites ran on the ordering deployment. The final change is confined to one previously unmapped missing URL; the final deployment separately passes all decided URL expectations, all 233 source-order checks and the five confirmed archive decisions. URL checks use the unchanged strict `checkRule` implementation with four in-flight checks sharing a 250 ms HTTP request-start interval; conditions and checker hashes are recorded.

The [watch comparison](../projects/london-potters/evidence/2026-11-12-order-watch/report.html) changed only the two gallery captures, as expected from the new order. The other eight captures are identical, dimensions are unchanged and all eighteen assertions pass. No new site-check findings appeared; the existing 42 remain. Gallery images and ordering were inspected and the new demo baseline established. Both the ordering repeat and the final-deployment repeat are quiet. No masks or pixel allowance were added.

Thirteen service/access decisions, the broader partial source inventory, accessibility findings, operational services and D1/R2 recovery remain production work. The earlier release file package is still a historical artifact of its preceding version. These checks verify the stated demo behaviour; they do not establish client acceptance or production readiness.

**Later on 12 November:** the [demo service decision follow-up](verification-london-potters-demo-services-2026-11-12.md) specifies all thirteen remaining URLs for the demo and passes all 1,155 recorded URL checks. The real production service/access policies remain open. This earlier record preserves its historical scope and results.
