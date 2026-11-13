# London Potters demo service URL decisions — 12 November 2026

**All thirteen demo service/access decisions are implemented and verified on the deployed demo.** All [1,155 recorded URL checks pass](../projects/london-potters/evidence/2026-11-12-demo-service-route-check/report.html), and the watch is quiet. The [route-by-route review](../projects/london-potters/evidence/2026-11-12-demo-service-decisions/review.html) records each choice. These decisions govern the existing public demonstration. Real production accounts, commerce, bookings, email and membership-access rules remain unresolved.

The [EmDash README](../../london-potters/emdash/README.md) owns migration scope and operation. This follows the [content/order review](verification-london-potters-content-order-2026-11-12.md). Its earlier evidence remains historical.

## Chosen behaviour

| Demo treatment                    | URLs | Behaviour                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical account alias           |    1 | `/my-account` returns 301 to `/my-account/`, retaining queries. This is a chosen demo convention; the source's earlier anonymous 403 is retained as evidence.                                                                                                                                                                                       |
| Purpose-specific inactive notices |    6 | Cart, checkout, member sign-in, password recovery and the two legacy product URLs return 200 with a clear explanation and a link to the public gallery or events. There are no login, reset, purchase or booking forms, fake empty carts, prices or success states. The legacy membership-product notice makes no claim about an individual member. |
| Published public event summaries  |    6 | The existing published calendar summaries stay at their original URLs with member access and booking explicitly inactive. No private event content or entitlement model is imported. Normal CMS unpublishing remains authoritative.                                                                                                                 |

For these service paths, all methods other than GET/HEAD return 405 with `Allow: GET, HEAD` and `Cache-Control: no-store`. The Worker rejects them before invoking the CMS handler; the same check supports local page rendering. No submitted body is parsed. The guard leaves native CMS administration, authentication APIs, media and ordinary public pages outside its scope.

The demo deliberately keeps checkout as an explanatory page, rather than imitating the live site's session-dependent empty-cart redirect. It retains informative pages at event/product paths rather than converting temporary access redirects into permanent homepage redirects. The six event-summary links also received a scoped contrast fix discovered during browser verification.

## Decision scope and artifacts

The [decision JSON](../projects/london-potters/evidence/2026-11-12-demo-service-decisions/decisions.json), [CSV](../projects/london-potters/evidence/2026-11-12-demo-service-decisions/decisions.csv) and [demo URL map](../projects/london-potters/evidence/2026-11-12-demo-service-decisions/redirect-map.json) now decide all **1,155 URLs in the recorded inventory**, with zero undecided demo rows. The thirteen additions comprise six rewrites to inactive notices, six retained summaries and one canonical redirect. All prior 1,142 decisions, including Clare's archive and the four 404s, remain intact.

The source inventory itself remains partial, so the exported map's `complete` flag correctly stays false. [Scope metadata](../projects/london-potters/evidence/2026-11-12-demo-service-decisions/decision-scope.json) and each service row retain the thirteen outstanding **production** service/access decisions. Resolving demo routing does not resolve real services or establish client approval.

The [decision editor](../projects/london-potters/evidence/2026-11-12-demo-service-decisions/index.html) starts blank as designed; import the supplied JSON. Desktop/mobile import, zero-undecided filtering, CSV round-trip, axe and overflow checks pass. The thirteen-case review is readable as a table on desktop and cards on mobile. Earlier live observations are reused with their original dates; no new source-site request, login or protected-content retrieval was needed to choose demo handling.

## Deployment and verification

Demo version `1bb41fe1-a7e9-470a-b2b6-9dfa7b340cac` replaces `73562d3b-7bdc-4f24-9202-ce2afe846aa4` on the existing `london-potters-emdash-demo` Worker. No production domain, service integration, schema, content record or native account was changed. Public noindex browsing and native CMS administration sign-in remain.

Canonical implementation: `src/lib/demo-services.ts`, `src/components/DemoServiceNotice.astro`, the existing catch-all renderer and Worker dispatch. Recorded GET expectations are not treated as proof of account, booking or payment functionality.

| Check                                   | Result                                                                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route/order/snapshot/service unit tests | 10 passed, including unsupported methods, alias handling and native CMS paths outside the guard                                                                                                                      |
| Astro typecheck                         | 38 files; zero errors, warnings or hints                                                                                                                                                                             |
| Build and Wrangler dry run              | Passed; existing large-bundle advisory remains                                                                                                                                                                       |
| Read-only native migration preflight    | No pending/unknown migrations; none executed                                                                                                                                                                         |
| Local and hosted route checks           | All thirteen URLs passed GET, HEAD and rejected empty POST checks; the account alias preserves queries                                                                                                               |
| Desktop/mobile browser checks           | 24 page/device checks passed; correct notice/summary content, no active service controls, zero axe WCAG A/AA violations and no overflow                                                                              |
| Recovery                                | Checkout notice links successfully back to the public gallery; browsing generated no service submission                                                                                                              |
| Complete content/filter sweep           | 5,143 passed across 804 entry paths and 309 filter combinations                                                                                                                                                      |
| Decision review                         | Thirteen cases and 1,155 imported decisions; zero undecided demo rows; CSV round-trip, desktop/mobile axe and overflow checks passed                                                                                 |
| Full demo URL map                       | All 1,155 recorded demo expectations passed; zero undecided demo rows; underlying source inventory remains partial                                                                                                   |
| Demo watch                              | [Quiet against the reviewed ordering baseline](../projects/london-potters/evidence/2026-11-12-demo-service-watch/report.html): ten identical captures, eighteen passing assertions and the same 42 existing findings |

Only empty, marked POST requests were sent directly to the demo to verify rejection. No credentials, personal data, real form, email, order, booking or password reset was submitted or processed. The hosted browser checks used GET/HEAD and verified the recovery link. Existing gallery ordering and earlier content decisions were preserved.

The broader source inventory, remaining accessibility findings, actual operational services and D1/R2 recovery remain production work. The earlier release package remains a historical artifact. These checks verify the declared demo behaviour; they do not establish representative-user validation or production readiness.
