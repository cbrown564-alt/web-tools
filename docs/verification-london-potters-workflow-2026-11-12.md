# London Potters complete workflow — 12 November 2026

This record owns the evidence from this run of the Web Tools workflow. [README.md](../README.md) owns commands, [plan.md](plan.md) owns tool status, and [the London Potters EmDash record](../../london-potters/emdash/README.md) owns that migration's scope and decisions.

**Outcome: the demo workflow was exercised; production release is blocked.** Open the [workflow report](../projects/london-potters/evidence/2026-11-12-workflow/report.html) for linked artifacts and the ten-area launch checklist. No production deployment, content/database migration, payment, staff email or authenticated account edit was performed.

## Scope and content policy

The source is `https://londonpotters.com`; the candidate is the existing `london-potters-emdash-demo` Worker. Conor confirmed the policy in this chat: preserve content and public URL paths, flagging exceptions. This authorises the preservation decision set; it does not establish client approval of a production migration or certify inactive services.

The EmDash application source was not changed. Its active version remained `77d74aef-7a07-43b3-a7d2-c16d701f959b` at 100% traffic at both ends of the run. Project-local Wrangler 4.158.0 was used for read-only deployment/version metadata and database schema/migration checks, plus a local `deploy --dry-run`. No upload, deploy, migration apply, remote restore or destructive command ran. Existing OAuth authentication was reused without printing its token. Metadata-only operations need read access; the existing credential has broader scopes, which were not used to change remote configuration or content. [Workers permissions](https://developers.cloudflare.com/workers/authorization/workers/) documents the access model.

## Inventory

| Observation              | URLs collected | Remaining / limitation                                                                  | Captures                                                 |
| ------------------------ | -------------: | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Fresh WordPress source   |             95 | 1,058 queued URLs left after HTTP 429; 1,153 known URLs and 795 normalized sitemap URLs | Four selected capture attempts failed with HTTP 429      |
| Fresh EmDash candidate   |            198 | Queue completed at depth 2; no URL sitemap collected, so partial                        | All 22 selected desktop/mobile captures passed           |
| Earlier source reference |          1,155 | Dated 17:46 run; already partial for redirects/captures, as documented in phase 3       | 23 verified capture files copied into the content review |

The fresh source crawl stopped on two HTTP 429 responses. No further live WordPress requests were made after the collector's selected capture attempts also returned 429. There was no alternate user agent, proxy or rate-limit bypass. The prior source inventory was retained as a dated reference, not merged into a supposedly fresh complete result. The inventory pointers now identify the latest partial observations; the preservation review explicitly pins the earlier 1,155-URL snapshot.

Both fresh inventories used depth 2, a 2,000-URL limit and representative captures with a 24-page cap. The candidate's 198 URLs are bounded public link discovery, not proof that every migrated route exists. Its missing sitemap remains visible. It retains deliberate demo noindex; production discovery/indexing work remains separate.

## Decisions and URL checks

The content review uses the earlier source snapshot's exact fingerprint and verified captures. The applied preservation set contains:

- **1,128 keep** decisions for observed public HTML URLs.
- **Eight existing permanent redirects** retained with their original status and destination; no new editorial consolidation.
- **19 undecided exceptions** for operational/account/commerce routes or failed/ambiguous source observations.
- **No rewrite or removal** inferred from HTTP errors or missing candidate content.

`decisions.json`, `decisions.csv` and `redirect-map.json` sit beside the review in `2026-11-12-workflow-content/`. `policy-confirmation.json` records the user's choice. Import the JSON into the review to inspect the policy decisions; the prepared HTML's default state remains a blank review template. Desktop/mobile browser checks imported all decisions, exposed the 19 undecided rows, passed axe/overflow checks and verified CSV round-trip. The checker's original draft map was saved before policy confirmation; its checked source/decision/status/destination fields exactly match the final policy map. Only notes differ.

All **1,136 exported rules** were checked read-only against the demo using explicit `--allow-partial`; **913 passed and 223 failed**. The map is partial because of the 19 undecided URLs and partial source inventory. No redirect was installed.

| Failure                                           | Count | Meaning                                                                                                        |
| ------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------- |
| Temporary redirects from retained directory URLs  |   213 | 32 area routes and 181 discipline routes return 302 to gallery filter URLs instead of the expected initial 200 |
| Existing permanent redirects no longer reproduced |     8 | Candidate returns 200 where source used 301 to its slash-terminated canonical URL                              |
| Missing retained profiles                         |     2 | `/profile/brenda/` and `/profile/valmai-barclay/` return 404                                                   |

Of the temporary directory redirects, **172 paginated paths lose their page parameter**. For example `/area/central-london/page/2/` ends at `/members-gallery/?area=central-london`. That does not demonstrate preservation of the original pagination or result set. The existing EmDash record already requires reviewing its 24-per-page pagination with Paul before promotion. These failures were not hidden by changing expectations to the current candidate behaviour. Missing profiles require a source/content decision; their 404s were not converted into removal decisions.

The checker establishes exact HTTP treatment, not matching text, images, access rules or operational behaviour. Keeping a public members-hub/resource URL does not prove signed-in access, entitlements or private downloads; those checks remain outstanding.

## Release artifact and recovery limits

The existing local build at source commit `7ddc1f9f5dffb5cfcbce975f4c908c52cb0e1d29` was clean when inspected. The project's documented Wrangler configuration redirected the dry run to `dist/server/wrangler.json`. The dry run produced Worker modules locally without uploading them. Those modules plus `dist/client` were staged inside this project as a fixed-list candidate: **5,947 files, 985,271,693 bytes**.

London Potters' canonical `release.json` now describes this actual code/assets snapshot, replacing its earlier sample content-review bundle specification. Earlier phase-5 archives remain unchanged. The package contains no database dump, R2 backup, credentials, environment file or automatic deployment configuration. A local artifact hash does not establish byte identity with the deployed Worker merely because version metadata matches the recorded release.

- Package manifest SHA-256: `e0bf9c85565559d97ad5d1ed78322e5a9f98bd7d29399ae6c859000774da3381`.
- Archive SHA-256: `bc51009961182aa6fa1d6ec261521afc265d68371188490422cd32dcd0277069`.
- File backup manifest SHA-256: `f4d0a28dd5ec3b929c211b46e8f01c4ca9d9d6f00bf4d2995cd8f50d3f4f1667`.
- Journal SHA-256: `756e62f0f017259aff9ee241979ffb507a2c01421c77fb0fc7b6f5abc412b1ff`.

The archive and every payload file verified. All 5,947 regular files restored into a fresh disposable copy before application. **Baseline and candidate were the same current local artifact: zero changed files and 5,947 unchanged files.** Reversal was a no-op, with original file contents/modes and the synthetic incoming file preserved. This run proves file artifact integrity/restore; it does not prove recovery to an earlier Worker version, D1/R2 recovery or preservation of real incoming operational records.

The read-only native migration check reported no pending or unknown migrations and executed none. The remote schema probe confirmed `_emdash_fts_pages` and `_emdash_fts_profiles` virtual tables. Cloudflare documents that standard D1 export does not support databases with virtual tables and that an export blocks other database requests. No export was attempted and no virtual table was deleted. A tested non-destructive database/media backup and isolated restore procedure remains a release blocker. [D1 import/export documentation](https://developers.cloudflare.com/d1/best-practices/import-export-data/) supports this limitation; the earlier demo seed export helper is not treated as a production backup strategy.

## Public journeys and forms

The current candidate passed **96 public browser checks**: combined filters, profile/artwork/return, menu focus, empty and failed-update recovery, paging and Show all, list/month calendar, no-JavaScript navigation and real high-density image resolution. The reference harness was read before execution. Its old absolute `/tmp` Puppeteer import no longer existed; a disposable copy changed only that import to the already-installed Web Tools dependency. Original/adapter hashes, conditions, outcome and capture hashes are recorded in `2026-11-12-workflow-public-journeys-verified/`. The first failed runner setup is preserved separately; no journey assertion was weakened.

This is Chromium public-visitor coverage, not member/staff role validation. No profile edit, protected file, payment or booking transaction was performed.

Five public page surfaces were inspected read-only for forms. The demo deliberately leaves email, payment, booking and operational membership services inactive. **Real delivery tests remain blocked**: no marked staff-mailbox submission or cleanup was performed. Repeating a synthetic local inbox test would not establish client delivery, so it was not substituted for this missing evidence.

## Watch

Added an `after`-site watch policy to the existing project record: five main-heading checks, gallery filter/card checks and required site/gallery script-tag presence. There are no masks and no allowed changed pixels. Script-tag presence is not itself a delivery proof; the public journey suite separately exercises behaviour.

The initial ten full-page captures passed hashes and all 18 assertions and were visually reviewed. The full minimal site check completed, including ten PageSpeed performance observations scoring 100. Existing news/membership axe findings and security/discovery findings remained visible. This does not establish overall accessibility, operational readiness or a site-wide performance guarantee.

The observed demo baseline was explicitly accepted locally, then repeated with the same policy. The repeat is **quiet**: ten captures, 18 passing assertions, zero visual changes and zero finding changes. **42 existing discrete site-check findings remain**. In particular, news has contrast/link-name/list findings and membership has contrast/list findings. Baseline acceptance acknowledges the observed state; it does not resolve these issues.

This establishes a manual watch for the existing demonstration. No new production release happened, no scheduler was created and no notifications were sent. After a future real cutover, the production URL and its reviewed baseline must be established separately.

## Verification and handoff

- `PROJECT=london-potters npm run check` passed all **45 tests**, production build and comparison browser workflows after the project configuration changes.
- The content decision JSON/CSV/import workflow passed desktop/mobile checks with zero axe violations and no overflow; checked map expectations match the final policy map.
- Eight generated workflow/tool reports were opened offline at desktop and mobile widths. Local evidence links, image loading, axe and overflow checks passed. Browser screenshots and the summary print rendition were inspected. Internal QA output is under `output/verification/london-potters-workflow/`.
- The original and restored artifact hashes, candidate and watch capture hashes, current deployment version and saved policy identity were checked. Generated evidence/output and `.env` remain ignored. A local secret scan did not print the PageSpeed key. Formatting and `git diff --check` passed.

All ten launch-checklist areas remain partial or blocked, with owners still to assign. At this checkpoint the next work was to resolve the 223 URL failures under the preservation policy, review the 19 undecided decisions, obtain a complete fresh source inventory after the rate limit, resolve required accessibility findings, and prove real services plus database/media restore before any production promotion. Source-site or service fixes were not silently folded into this verification run.

**Later on 12 November:** the [URL repair follow-up](verification-london-potters-url-fixes-2026-11-12.md) resolves all 223 failures on a new demo deployment. All 1,136 decided URL checks pass and the reviewed watch repeat is quiet. The nineteen undecided decisions, live archive membership/order exception and operational/recovery requirements remain. This original report and its Worker/assets package retain their historical results.
