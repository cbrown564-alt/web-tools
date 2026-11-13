# Web Tools plan

Written 12 November 2026. This document owns the sequence of tools to build, what each one is for, and what "done" means for each. [PRODUCT.md](../PRODUCT.md) owns the behaviour of tools that already exist. Update the status table here when a phase starts or finishes; record changes of direction in the decisions list at the end.

## Status

| Phase | Tool                             | State   |
| ----- | -------------------------------- | ------- |
| 0     | Before & after comparison        | Working |
| 1     | Site check, minimal and standard | Working |
| 2     | Post-launch watch                | Working |
| 3     | Page inventory and discovery kit | Working |
| 4     | Content decisions and redirects  | Working |
| 5     | Release kit and form tests       | Working |
| 6     | Site check, maximum tier         | Working |
| 7     | Content match, old to new        | Next    |
| 8     | Maintenance plan                 | Gated   |
| 9     | Pitch pack                       | Gated   |
| Later | EmDash starter, promo studio     | Parked  |

## Where this comes from

Three completed or active jobs supplied the evidence:

- **Research Network** and **London Potters** are the two projects the comparison tool runs on today.
- **London Potters** (`~/code/london-potters`) had a forensic performance investigation between 5 and 9 November 2026. It was more extensive than most jobs need, and its harness was copied five times with the copies drifting apart.
- **Elizabeth Norman International** (`~/code/liz`) is the most complete job: discovery, content review with the client, release without a staging site, and six weeks of post-launch fixes. It has about 213 scripts, nearly all tied to that one site.

Script paths cited below were confirmed to exist on 12 November 2026. Descriptions of what they do come from a survey of those repositories, not from reading every script; read a script before porting it.

Velocity (`www.researchvelocity.co.uk`, repository `~/code/Velocity`) and Red Thread (`www.utdred.com`, repository `~/code/unitedstats`) are also active projects owned by the tool's owner. They join phase 1 as live-site checks only. Velocity's public website is separate from its desktop research app; the app is outside this check record. The initial reusable methods above came from the three client jobs, not from a completed audit of these two products.

## Principles

1. **Functional, not elegant.** Every interface and report is a plain tool: as little chrome as possible, the evidence as the focus.
2. **No disclaimers on client material.** Do not add caveats about approval, launch or status. Do not write false claims either. Method notes belong in a short method section or the internal evidence folder.
3. **One project record, one project per build.** Tools read `projects/<id>/project.json`. Nothing built for one client ships another client's material.
4. **Tiers answer different questions.** A deeper tier is not the same checks run more times. If a tier cannot be described as a question, it should not exist.
5. **Cheap checks first.** In London Potters, a 20-line cached vs uncached timing pair found more than the 1,186-page crawl. Build the cheap check, look at what it finds, then decide whether the expensive one is needed.
6. **One harness, depth as a setting.** Never copy a harness to change its depth or target.
7. **Prove on two projects before generalising.** A tool is "working" when it has run on two real projects without code changes between them.
8. **Extract shapes, not scripts.** Port the idea and the method from Liz and London Potters. Do not port site-specific scripts.

## Shared foundations

These are built as the first tool that needs them requires, not ahead of time.

- **Project record** (exists). Sites, page pairs, devices. Phase 1 also accepts a single live site for checks without a comparison; phase 3 adds a link to the inventory.
- **Capture pipeline** (exists: `scripts/capture.mjs`). Records URL, time, viewport and hash for every screenshot. Phase 2 needs full-page capture and handling of lazy-loaded images, which dropped out of full-page captures in Liz.
- **Evidence folder.** Each run writes to `projects/<id>/evidence/<date>-<tool>/`: raw results as JSON, a `conditions.json` (tool versions, settings, machine), and nothing containing credentials. Reports are rendered from this JSON and can be rebuilt without re-measuring.
- **Report renderer.** One plain HTML template family shared by every tool, printable to PDF, in the same style as the comparison page.
- **Page inventory** (phase 3). A crawl of a site's sitemap into one file per site: URL, status, title, template group, size.

## Phase 1: site check, minimal and standard

**Completed 12 November 2026.** Minimal and standard ran on London Potters and Research Network with one recorded collector digest; the same minimal command ran on Velocity and Red Thread. The archived Lighthouse replay matches all 54 audits and 18 historical groups. Changed photographs, pagination, image delivery, layout and access conditions explain why the older ranges are different observations. Source failures remain visible in the reports. [Verification](verification-site-check-2026-11-12.md) records the acceptance runs, reconciliation and limits.

**Why first.** It is useful on every job, it needs only the project record, and London Potters already has results to validate it against.

**Shape.** One command, with modules and a tier:

```sh
PROJECT=london-potters npm run site-check -- --tier standard --modules performance,cache
```

Each module runs against every site in the record on the record's pages and devices. London Potters and Research Network have before/after pairs; Velocity and Red Thread have one live site each.

| Module        | Minimal: is anything obviously wrong?                                                                          | Standard: how do before and after compare?                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Performance   | One PageSpeed Insights API call per page and device: lab scores and visitor data when available                | Three Lighthouse runs per page and device, order rotated between sites; median and range. One cold and one repeat browser load with request and transfer breakdown |
| Cache         | For each page, two plain requests and two with a unique query string; compare response times and cache headers | The same across a sample of the sitemap, grouped by cache state                                                                                                    |
| Accessibility | Automated scan (axe) of each page                                                                              | Scan on both devices plus a keyboard pass: skip link, menu, focus return                                                                                           |
| Security      | Response headers and redirects for each page                                                                   | Adds form destinations, TLS and email-authentication records                                                                                                       |
| Discovery     | Status code, title, canonical URL, indexing directive                                                          | Adds sharing metadata, sitemap consistency and broken internal links on the listed pages                                                                           |

**Method rules built in once.** Each of these cost a discarded run in London Potters:

- Before measuring, confirm every site returns the page successfully with a visible main heading. Skip and report pages that fail.
- Rotate the order of sites on each repetition.
- Keep the tab in the foreground and use a fresh browser context per run.
- Wait on conditions, never fixed delays.
- Record the collector digest, throttling settings and tool versions with the results.
- Refuse to overwrite an existing evidence folder.

**Outputs.**

- Minimal: one page of status cards per site, with the numbers behind each.
- Standard: a before/after comparison report with one table per module and a short "how this was measured" section.
- Both: the evidence folder.

**Done when.**

- Minimal and standard run on London Potters and Research Network with no code changes between them.
- On London Potters, the cache module shows the same fast-cached and slow-uncached split recorded on 5 to 9 November, and Lighthouse medians fall inside the ranges in `london-potters/docs/performance-comparison-2026-11-08.html`, or the difference is explained.
- Minimal completes in under five minutes for five pages.
- The same minimal command also runs on the live-only Velocity public website and Red Thread records without code changes between them.

**Start from.** In `~/code/london-potters`: `emdash/scripts/lighthouse-phase1.mjs` and `summarise-phase1.mjs` (already driven by settings), `docs/evidence/2026-11-08/performance/scripts/browser.cjs`, `docs/evidence/2026-11-05/follow-up/scripts/paired.py` and `hitmiss.py`, `docs/evidence/2026-11-08/security/scripts/collect.py`. In `~/code/liz/tools`: `a11y-frontend.mjs`, `check-share-metadata.py`.

**Not in this phase.** Full crawls, user journeys, cause-finding experiments, filmstrips. Those are phase 6.

## Phase 2: post-launch watch

**Completed 12 November 2026 as a manual prototype.** Capture, compare, review, accept and repeat work with immutable evidence and portable reports. The three saved Liz defects are detected, identical and restored copies produce zero changes, and the same collector ran on Velocity and Red Thread. All twenty final live captures and assertions passed; live reports retain changing axe findings and video-indicator differences for review. [Verification](verification-watch-2026-11-12.md) records the runs, capture recovery, checks and limits.

**Why.** Liz had defects found days or weeks after launch: a survey script missing from the new header, gallery styles missing, Word CV attachments broken, new posts missing from a listing, stale sharing metadata. Most were visible on a public page.

**Shape.** A baseline and a repeatable comparison against it:

- Full-page captures of the record's pages, compared with the last accepted baseline.
- A short list of assertions per project: scripts that must be present, elements that must be visible, pages that must list recent items.
- The site check at minimal tier.
- Output: a plain report of what changed, with the before and after captures side by side. Accepting a change makes it the new baseline.

**Done when.** Replaying three of the Liz defects against saved copies of the pages makes the watch report each one, and a run with no real change reports nothing.

**Operation.** Run by hand with `npm run watch`; accept a reviewed run with `npm run watch -- accept --run <name>`. Scheduling and notifications are deferred until the manual reports have been used in normal work.

## Phase 3: page inventory and discovery kit

**Completed 12 November 2026 as a manual prototype.** The same collector produced London Potters and Elizabeth Norman inventories, with the historical 1,186 / 176 URL differences reconciled. Live verification used explicit representative captures on both devices; all-page capture is available but was not run over the full catalogues. London Potters retains its partial state for blocked redirects and failed captures. [Verification](verification-inventory-2026-11-12.md) records coverage, results, checks and limits.

**Why.** The inventory is the "before" for everything else: the comparison picks its pages from it, the watch samples it, and content decisions are made on it.

**Shape.** Crawl a site's sitemap and follow links to a set depth. For each page record status, redirects, title, canonical URL, template group and size, and capture it at the record's devices. A technical probe records the platform, plugins and versions visible from outside, forms and trackers. Competitor sites can be captured with the same command for a side-by-side sheet.

**Done when.** It produces an inventory for London Potters and Elizabeth Norman that agrees with the hand-built ones (1,186 URLs and 176 URLs) or the differences are explained.

**Start from.** `london-potters/docs/evidence/2026-11-05/completion/scripts/census.py`; `liz/tools/audit-all-surfaces.mjs` and `probe-technical-stack.mjs`.

## Phase 4: content decisions and redirects

**Completed 12 November 2026 as a static prototype.** Reviews prepared from both real inventories support explicit dispositions, notes, browser persistence and JSON/CSV exchange. Decision maps retain undecided and partial-source coverage; the read-only checker detects exact status/destination errors, loops, chains and failed targets. All real editorial choices remain undecided. [Verification](verification-content-2026-11-12.md) records the complete fixture workflow, real-page checks and limits.

**Why.** In Liz the content review was a chain: the client sorted 176 URLs into keep, rewrite, consolidate or remove; those decisions became the redirect map; the redirect map became a launch check.

**Shape.** A review page over the inventory with a screenshot per page, a decision per page and a notes field. Decisions export to a spreadsheet and to a redirect map. A checker verifies every old URL lands where the map says.

**Operation.** Keep this phase static: local browser edits, JSON backup and CSV spreadsheet exchange. Read Liz’s review product before porting the workflow; its server persistence is not required for this bounded prototype. Shared hosted storage remains a later choice.

**Start from.** `liz/tools/build-redirect-review.py`, `check-release-urls.py`.

## Phase 5: release kit and form tests

**Completed 12 November 2026 as a local manual prototype.** The same collector packaged two real static content-review bundles, verified their pins, restored backups, applied selected files and reversed them while preserving synthetic incoming data. All 36 local form cases passed with independent capture receipts and scoped cleanup. Ten launch areas remain pending; client CMS deployment, database/media restore and actual staff-mailbox delivery are separate production work. [Verification](verification-release-2026-11-12.md) records the exact artifacts, checks and limits.

**Why.** Liz was released without a staging site and then patched six or more times using the same pattern. The pattern worked and is worth keeping.

**Shape.**

- A package with a fixed file list and hashes, verified before it is applied.
- Selective changes recorded with a reversal journal.
- A backup restored into a throwaway copy before release, to prove it restores.
- Form tests: submit marked test messages, confirm arrival, simulate failures (network loss, server error), then clean up the test records.
- A launch checklist drawn from the ten-area test matrix in `liz/docs/planning/design-brief.md`.

**Caution.** Much of this is WordPress-specific. Write down the platform-neutral steps first, then the WordPress version, then an EmDash version when a job needs it.

**Start from.** `liz/tools/package-theme-uploader.py`, `check-post-launch-recovery.mjs`, `check-adversarial-public.mjs`.

## Phase 6: site check, maximum tier

**Completed 12 November 2026 as a bounded manual prototype.** Profiles now drive full discovery within explicit bounds, repeat cache probes, timed public journeys, alternating ablation/deployment comparisons, Chrome performance traces, actual filmstrips and selected layout/pixel parity. A controlled delayed-script fixture proves the causal investigation loop; the same collector ran on Velocity live and the Research Network demonstration. All 28 real journey samples completed. Research Network retains its `/home` 404 as partial, and all four real font-ablation assessments remain unresolved. No production fix is claimed. [Verification](verification-maximum-2026-11-12.md) records sources, scope, results and checks.

**Question it answers.** Why is it slow, and is the fix proven?

Built when a job needs it, not before. Adds a full crawl with cache-state analysis, timed user journeys, interleaved experiments on a suspected cause, filmstrips, layout-parity checks between before and after, and full traces. The report is numbered findings, each labelled confirmed, strongly supported or unresolved, with an evidence map.

**Start from.** The rest of `london-potters/docs/evidence/` and `emdash/scripts/bench-feel.mjs`, `check-layout-parity.mjs`.

## Next phases

Recorded 13 November 2026, after phases 0 to 6 and experience paths 0 to 3 were built. The tools now cover a job from audit to post-launch watch. The largest remaining opportunities sit either side of a job (winning it and looking after it) and in the migration step between inventory and release.

### Ranking by value

1. **Maintenance plan** (phase 8). Recurring work with evidence behind it. The Research Network brief says its current support service is unreliable and that the project needs dependable maintenance and support. Elizabeth Norman needed six weeks of post-launch fixes, most visible on a public page. Watch, minimal site check and `wt share` already exist.
2. **Content match, old to new** (phase 7). Migration is where hours and defects concentrate: 223 London Potters URL failures repaired by hand, 446 gallery profiles matched by hand, and Liz's lost survey loader, gallery styles and recent article. The redirect check proves an old URL lands somewhere; nothing proves the destination carries the same content.
3. **Pitch pack** (phase 9). Prospect concept work has been built by hand three times: Hugh Anthony (`~/code/hugh-anthony`), the London Potters website and security reviews for Paul, and Leyline's `review/before` with its own `shoot.mjs`.
4. **Shared client review.** Experience path 5, unchanged in scope. Research Network is the likely job to meet its entry gate, because the five-year archive rule needs a client decision on many URLs.

This ranking assumes that concept redesigns win work and that clients will pay for ongoing maintenance. Neither has been confirmed with a client; revisit the ranking if either is wrong.

### Order

1. **Clear the open experience gates.** Push `main` so CI runs (path 0). Restate the 1 GB line in path 2 as "duplicates stored once and no unprotected run left". Run the three-reader test (path 3); experience principle 6 holds new tools until it passes.
2. **Run Research Network through `wt` as the proving job.** Start with `wt inventory research-network`; it has no inventory yet. Use it for the programme exit in [experience.md](experience.md#programme-exit) and build phase 7 as part of its migration.
3. **Build phase 8 on the watch** once a site the owner maintains is live and experience path 4 is under way. Path 4's entry gate is effectively met: path 2 is passed except the 1 GB line, and Elizabeth Norman, Velocity and Red Thread are live.
4. **Build phase 9 when the next prospect arrives**, not before.

### Phase 7: content match, old to new

**Question it answers.** Does each new page carry what its old page carried?

**Shape.** Read the source inventory, the destination inventory and the content decision map. For every kept, rewritten or consolidated URL, compare the old page with its mapped destination: main heading and headings, main text (length and a similarity measure), images present and loading, links out, listing items, title, description and sharing metadata. Findings group by cause across pages. Rewritten pages report differences for review rather than failures; kept pages report losses as findings. Removed and undecided URLs are counted, not compared.

**Done when.** On London Potters it finds the gallery and archive ordering differences that were matched by hand, or explains why not; replaying the saved Liz pages reports the missing recent article and stale sharing metadata; and it runs on Research Network's migration with no code changes between the two real projects.

**Not in this phase.** Judging whether rewritten copy is better, authenticated pages, comparing CMS databases directly.

**Start from.** `scripts/inventory/`, `scripts/content/` and the watch assertions in `scripts/watch/`. In `~/code/london-potters`, the content/order verification recorded in [verification-london-potters-content-order-2026-11-12.md](verification-london-potters-content-order-2026-11-12.md).

### Phase 8: maintenance plan

**Question it answers.** Is the client's site still healthy this month, and what was done about it?

**Entry gate.** Experience path 4 running on at least one client site, and a client who has agreed to ongoing support.

**Shape.** A monthly client report built from the scheduled watch and minimal site-check runs in that period: what was checked, what changed, what was found and fixed, what still needs a decision. It reuses the three opening blocks and `wt share`. A plain record of work done during the month can be attached from the project folder. Nothing is reported as fixed unless a later run shows it.

**Done when.** Two consecutive monthly reports for two sites are sent as produced, with no covering note, and each finding in a report links to the run that found it and, where fixed, the run that shows it fixed.

**Not in this phase.** Billing, uptime monitoring from outside the owner's machine, client accounts.

### Phase 9: pitch pack

**Question it answers.** What is wrong with a prospect's current site, and what could it look like?

**Entry gate.** A real prospect.

**Shape.** One command from a URL: `wt new`, a minimal site check, a representative inventory, the three most consequential findings in client wording, and before/concept captures when a concept URL is supplied. Output is one shareable bundle in the comparison style. The prospect's record is a normal project record, so a won job continues from it.

**Done when.** Two real prospects receive a pack produced by the command alone, and the capture step replaces the hand-built ones used for Hugh Anthony and Leyline.

**Not in this phase.** Building the concept itself, generated design, pricing.

## Parked

- **EmDash starter.** Still the default platform for new builds, but neither finished job gives a repeatable pattern yet. Revisit after a second EmDash build.
- **Promo studio.** No precedent in any project. Revisit when a client asks for launch media.
- **Option boards.** Comparing three or more design alternatives in rounds, as Liz did. Likely a small extension of the comparison tool; do it when the next design round needs it.

## Decisions

- 12 November 2026: tiers are defined by the question they answer. Minimal and standard are built first; maximum waits for a job that needs it.
- 12 November 2026: the site check comes before the post-launch watch, because the watch reuses its minimal tier.
- 12 November 2026: scripts from earlier jobs are reference material. Tools here are written fresh against the project record.

- 12 November 2026: phase 1 uses PageSpeed Insights for minimal performance checks, with a local `.env` key. Reports use plain explanations suitable for client review, with conditions and raw results in the evidence folder. Visitor data is optional because Google plans to remove it from the PageSpeed API; a separate CrUX integration is deferred.

- 12 November 2026: added the owner’s Velocity public website and Red Thread (repository ID `unitedstats`) as live-site records, at the owner’s request. Single-site checks use a version 2 record instead of duplicating one live URL as a before/after pair; the existing comparison records remain version 1.

- 12 November 2026: completed phase 1. The historical comparison is reconciled by a 54-audit replay against the independent archived summary and raw evidence of changed page inputs after the 10 November EmDash optimisation. Historical ranges remain dated references; they are not fixed regression bounds for different page content. Fresh paired-project runs used the same checksummed collector, preserving source failures rather than changing limits to obtain a clean report.

- 12 November 2026: completed the manual post-launch watch before choosing a scheduler. The command reuses minimal site checks and the shared plain HTML report template. Saved-section replays use actual Liz content and repairs with inactive local assets; live proof uses Velocity and Red Thread. Explicit baseline acceptance preserves evidence and refuses failed or stale runs. Scheduling and notifications remain deferred.

- 12 November 2026: phase 3 keeps one generated inventory per site and a local per-site index in the project record. Dated inventories provide optional historical seeds and exact URL reconciliation; they are not assumed to describe today's live pages. Full-page capture defaults to all successful HTML URLs, with explicit representative/none modes for bounded runs. The two real acceptance runs use representative captures and retain London Potters' source and capture failures. Competitor configuration and a portable comparison sheet reuse the same collector; no external competitor was selected for the proof.

- 12 November 2026: phase 4 uses static review pages with local browser persistence and JSON/CSV exchange. A hosted database is deferred. Decisions are bound to the project and inventory snapshot; none are inferred from historical recommendations or HTTP errors. Exact redirect maps and read-only checks are separate from installing rules. The same preparer ran on London Potters and Elizabeth Norman; editorial decisions and production URL changes remain separate work.

- 12 November 2026: phase 5 proves the platform-neutral procedure on two real static review bundles, with marked synthetic local form delivery. Explicit file lists, trusted manifest/archive pins, restored backups and selective reversal precede any future CMS adapter. Isolated loopback profiles reuse the form harness; production mail and database recovery are not inferred from fixture success. WordPress and EmDash operating notes live in README; no production deployer is added speculatively.

- 12 November 2026: phase 6 uses explicit investigation profiles and the existing inventory crawler rather than duplicating the standard tier. Exact resource suppression is a browser-only diagnostic; different deployments remain confounded. Numbered findings require matched interventions, alternating pairs, meaningful repeated effects and selected parity before labelling an ablation strongly supported. Maximum does not call PageSpeed or automatically approve a production optimisation. Failed sources and incomplete investigations retain partial reports.

- 13 November 2026: recorded the next phases. Ranked by value: maintenance plan, content match, pitch pack, shared client review. Built in the order content match (on Research Network), maintenance plan, pitch pack, after the open experience gates close. Selling the toolkit to others is out of scope for now, because everything assumes the owner's machine, evidence folders and record formats. The EmDash starter and promo studio stay parked.

## Complete workflow use

12 November 2026: ran London Potters through preservation decisions, URL checks, an actual Worker/assets file package and restore, public journeys and a manual demo watch. The initial 223 URL failures were repaired. The nineteen exceptions now all have **demo-only** treatment: retain the cart canonical redirect and Clare's archive, return 404 for four missing URLs, show six inactive service notices, preserve six public event summaries and canonicalise the account alias. All 1,155 URLs in the recorded snapshot have demo decisions and pass checks; the source inventory itself remains partial. The 446-profile gallery and 213 area/discipline archive pages match captured live ordering. The current watch is quiet. Production release still needs the thirteen real service/access policies, operational implementations, broader source inventory, accessibility work and D1/R2 recovery. [Workflow evidence](verification-london-potters-workflow-2026-11-12.md), [URL repairs](verification-london-potters-url-fixes-2026-11-12.md), [content/order verification](verification-london-potters-content-order-2026-11-12.md) and [demo service decisions](verification-london-potters-demo-services-2026-11-12.md) record the distinct stages. The London Potters EmDash README owns migration scope. The earlier release artifact remains historical.
