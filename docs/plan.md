# Web Tools plan

Written 12 November 2026. This document owns the sequence of tools to build, what each one is for, and what "done" means for each. [PRODUCT.md](../PRODUCT.md) owns the behaviour of tools that already exist. Update the status table here when a phase starts or finishes; record changes of direction in the decisions list at the end.

## Status

| Phase | Tool                             | State       |
| ----- | -------------------------------- | ----------- |
| 0     | Before & after comparison        | Working     |
| 1     | Site check, minimal and standard | Not started |
| 2     | Post-launch watch                | Not started |
| 3     | Page inventory and discovery kit | Not started |
| 4     | Content decisions and redirects  | Not started |
| 5     | Release kit and form tests       | Not started |
| 6     | Site check, maximum tier         | Not started |
| Later | EmDash starter, promo studio     | Parked      |

## Where this comes from

Three completed or active jobs supplied the evidence:

- **Research Network** and **London Potters** are the two projects the comparison tool runs on today.
- **London Potters** (`~/code/london-potters`) had a forensic performance investigation between 5 and 9 November 2026. It was more extensive than most jobs need, and its harness was copied five times with the copies drifting apart.
- **Elizabeth Norman International** (`~/code/liz`) is the most complete job: discovery, content review with the client, release without a staging site, and six weeks of post-launch fixes. It has about 213 scripts, nearly all tied to that one site.

Script paths cited below were confirmed to exist on 12 November 2026. Descriptions of what they do come from a survey of those repositories, not from reading every script; read a script before porting it.

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

- **Project record** (exists). Sites, page pairs, devices. Phase 1 adds nothing; phase 3 adds a link to the inventory.
- **Capture pipeline** (exists: `scripts/capture.mjs`). Records URL, time, viewport and hash for every screenshot. Phase 2 needs full-page capture and handling of lazy-loaded images, which dropped out of full-page captures in Liz.
- **Evidence folder.** Each run writes to `projects/<id>/evidence/<date>-<tool>/`: raw results as JSON, a `conditions.json` (tool versions, settings, machine), and nothing containing credentials. Reports are rendered from this JSON and can be rebuilt without re-measuring.
- **Report renderer.** One plain HTML template family shared by every tool, printable to PDF, in the same style as the comparison page.
- **Page inventory** (phase 3). A crawl of a site's sitemap into one file per site: URL, status, title, template group, size.

## Phase 1: site check, minimal and standard

**Why first.** It is useful on every job, it needs only the project record, and London Potters already has results to validate it against.

**Shape.** One command, with modules and a tier:

```sh
PROJECT=london-potters npm run site-check -- --tier standard --modules performance,cache
```

Each module runs against every site in the record (before and after) on the record's pages and devices.

| Module        | Minimal: is anything obviously wrong?                                                                          | Standard: how do before and after compare?                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Performance   | One PageSpeed Insights API call per page and device: lab scores and visitor data                               | Three Lighthouse runs per page and device, order rotated between sites; median and range. One cold and one repeat browser load with request and transfer breakdown |
| Cache         | For each page, two plain requests and two with a unique query string; compare response times and cache headers | The same across a sample of the sitemap, grouped by cache state                                                                                                    |
| Accessibility | Automated scan (axe) of each page                                                                              | Scan on both devices plus a keyboard pass: skip link, menu, focus return                                                                                           |
| Security      | Response headers and redirects for each page                                                                   | Adds form destinations, TLS and email-authentication records                                                                                                       |
| Discovery     | Status code, title, canonical URL, indexing directive                                                          | Adds sharing metadata, sitemap consistency and broken internal links on the listed pages                                                                           |

**Method rules built in once.** Each of these cost a discarded run in London Potters:

- Before measuring, confirm every site returns the page successfully with a visible main heading. Skip and report pages that fail.
- Rotate the order of sites on each repetition.
- Keep the tab in the foreground and use a fresh browser context per run.
- Wait on conditions, never fixed delays.
- Record the throttling settings and tool versions with the results.
- Refuse to overwrite an existing evidence folder.

**Outputs.**

- Minimal: one page of status cards per site, with the numbers behind each.
- Standard: a before/after comparison report with one table per module and a short "how this was measured" section.
- Both: the evidence folder.

**Done when.**

- Minimal and standard run on London Potters and Research Network with no code changes between them.
- On London Potters, the cache module shows the same fast-cached and slow-uncached split recorded on 5 to 9 November, and Lighthouse medians fall inside the ranges in `london-potters/docs/performance-comparison-2026-11-08.html`, or the difference is explained.
- Minimal completes in under five minutes for five pages.

**Start from.** In `~/code/london-potters`: `emdash/scripts/lighthouse-phase1.mjs` and `summarise-phase1.mjs` (already driven by settings), `docs/evidence/2026-11-08/performance/scripts/browser.cjs`, `docs/evidence/2026-11-05/follow-up/scripts/paired.py` and `hitmiss.py`, `docs/evidence/2026-11-08/security/scripts/collect.py`. In `~/code/liz/tools`: `a11y-frontend.mjs`, `check-share-metadata.py`.

**Not in this phase.** Full crawls, user journeys, cause-finding experiments, filmstrips. Those are phase 6.

## Phase 2: post-launch watch

**Why.** Liz had defects found days or weeks after launch: a survey script missing from the new header, gallery styles missing, Word CV attachments broken, new posts missing from a listing, stale sharing metadata. Most were visible on a public page.

**Shape.** A baseline and a repeatable comparison against it:

- Full-page captures of the record's pages, compared with the last accepted baseline.
- A short list of assertions per project: scripts that must be present, elements that must be visible, pages that must list recent items.
- The site check at minimal tier.
- Output: a plain report of what changed, with the before and after captures side by side. Accepting a change makes it the new baseline.

**Done when.** Replaying three of the Liz defects against saved copies of the pages makes the watch report each one, and a run with no real change reports nothing.

**Open question.** Where the scheduled run lives: this machine, a scheduled cloud job, or run by hand weekly.

## Phase 3: page inventory and discovery kit

**Why.** The inventory is the "before" for everything else: the comparison picks its pages from it, the watch samples it, and content decisions are made on it.

**Shape.** Crawl a site's sitemap and follow links to a set depth. For each page record status, redirects, title, canonical URL, template group and size, and capture it at the record's devices. A technical probe records the platform, plugins and versions visible from outside, forms and trackers. Competitor sites can be captured with the same command for a side-by-side sheet.

**Done when.** It produces an inventory for London Potters and Elizabeth Norman that agrees with the hand-built ones (1,186 URLs and 176 URLs) or the differences are explained.

**Start from.** `london-potters/docs/evidence/2026-11-05/completion/scripts/census.py`; `liz/tools/audit-all-surfaces.mjs` and `probe-technical-stack.mjs`.

## Phase 4: content decisions and redirects

**Why.** In Liz the content review was a chain: the client sorted 176 URLs into keep, rewrite, consolidate or remove; those decisions became the redirect map; the redirect map became a launch check.

**Shape.** A review page over the inventory with a screenshot per page, a decision per page and a notes field. Decisions export to a spreadsheet and to a redirect map. A checker verifies every old URL lands where the map says.

**Open question, to settle before building.** Liz's review app let the client record decisions through a private link, which needed a hosted database. The comparison tool is static by decision. Either the client's decisions are collected in a spreadsheet and imported, or this tool gets a small backend. Read `liz/review/PRODUCT.md` first.

**Start from.** `liz/tools/build-redirect-review.py`, `check-release-urls.py`.

## Phase 5: release kit and form tests

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

**Question it answers.** Why is it slow, and is the fix proven?

Built when a job needs it, not before. Adds a full crawl with cache-state analysis, timed user journeys, interleaved experiments on a suspected cause, filmstrips, layout-parity checks between before and after, and full traces. The report is numbered findings, each labelled confirmed, strongly supported or unresolved, with an evidence map.

**Start from.** The rest of `london-potters/docs/evidence/` and `emdash/scripts/bench-feel.mjs`, `check-layout-parity.mjs`.

## Parked

- **EmDash starter.** Still the default platform for new builds, but neither finished job gives a repeatable pattern yet. Revisit after a second EmDash build.
- **Promo studio.** No precedent in any project. Revisit when a client asks for launch media.
- **Option boards.** Comparing three or more design alternatives in rounds, as Liz did. Likely a small extension of the comparison tool; do it when the next design round needs it.

## Open questions for the owner

1. Is there a PageSpeed Insights API key to use, or should the minimal tier run Lighthouse locally instead?
2. Will clients see site-check reports, or are they internal? This decides how much plain-language explanation the standard report carries.
3. Where should the post-launch watch run on a schedule?
4. Is a small hosted backend acceptable for the content review, or must it stay static?

## Decisions

- 12 November 2026: tiers are defined by the question they answer. Minimal and standard are built first; maximum waits for a job that needs it.
- 12 November 2026: the site check comes before the post-launch watch, because the watch reuses its minimal tier.
- 12 November 2026: scripts from earlier jobs are reference material. Tools here are written fresh against the project record.
