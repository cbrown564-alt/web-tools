# Web Tools experience strategy

Written 12 November 2026. This document owns the work that turns six working tools into something pleasant to operate and clear to read. [plan.md](plan.md) owns which tools exist and what each one proves. Update the status table when a path starts or passes its gate; record changes of direction in the decisions list.

## Status

| Path | Name                        | State       |
| ---- | --------------------------- | ----------- |
| 0    | Secure the base             | Not started |
| 1    | One front door              | Not started |
| 2    | Runs you can live with      | Not started |
| 3    | Reports a client can act on | Not started |
| 4    | Unattended watch            | Gated       |
| 5    | Shared client review        | Gated       |

## Position

Every phase in plan.md is proven on two projects. What is unproven is the experience between the pieces: between one command and the next, between one run and the last, and between the operator and the client. Each tool was accepted in isolation, so that is where the friction is.

There are two users and they need different things.

- **The operator** runs commands, reads evidence and decides what to do next. Their experience is the CLI, the project record, the evidence folders and the docs.
- **The reader** is a client or colleague who receives a report or a review page. Their experience is one page, opened once, usually without the operator present.

PRODUCT.md already states the reader's bar: understand what changed, why it helps and what still needs a decision. The comparison tool meets it. The other reports do not yet.

## What was observed

Taken from using the repository on 12 November 2026, not from reading the plan.

**Operator**

- Phases 1 to 6 exist only in the working tree: 43 untracked paths and about 3,300 changed lines against a nine-commit history. Nothing can be bisected, reverted or reviewed.
- `npm test` takes 49 seconds for 45 tests and failed once in five runs. `tests/content-browser.test.mjs` asserts the "Import failed" message without waiting for it. There is no CI.
- Six commands have six grammars. `--site` in watch, inventory and content; `--sites` in site-check. `--render` takes a path in site-check and a run name elsewhere. Watch has exit code 3; the others stop at 2. Arguments are parsed three different ways.
- `PROJECT=velocity npm run capture -- --help` prints a stack trace. `npm run release` on a project without `release.json` prints a raw `ENOENT`.
- Nothing lists projects, runs, the accepted baseline or the next step. The operator finds state by listing folders.
- London Potters has 61 evidence folders and 6.5 GB. Three folders hold 5.5 GB of that. Names carry the history of the session (`-final`, `-verified`, `-checked`, `-final-watch-check`) rather than what the run is. Evidence is ignored by Git and has no backup or pruning.
- Tools are chained by hand. A release rehearsal needs a folder path and a SHA copied from the previous command's output.
- A new project is a hand-written JSON file in one of two record versions.
- The README is 470 lines and is both the quick start and the full reference. The first runnable site-check command is on line 70; the method caveats a newcomer does not need yet surround it.

**Reader**

- Reports share one plain template. This is right and should not change.
- Reports lead with collection accounting ("30 collected, 0 skipped or failed") and machine identifiers (`accessibility/live/gallery/mobile: color-contrast (6 elements)`, `2026-11-12T16:02:10.859Z · 740.1 seconds`). The reader cannot tell which line matters.
- No report states what needs a decision.
- The content review is the tool a client uses most actively and has the weakest handoff: decisions live in one browser and move by JSON or CSV file. London Potters shows 1,155 URLs with 13 captures.
- The watch only watches when someone remembers to run it.
- Only the comparison has a packaging step. Every other report is a file in an ignored folder.

## Principles

These add to the eight in plan.md. They do not replace them.

1. **Experience work is measured on a real job.** A gate is passed by timing a task or watching a person read a page, never by the feature existing.
2. **Remove steps before adding features.** A default that saves typing a run name beats a new command.
3. **The operator should never need the README to recover from an error.** The message names the cause and the next command.
4. **The first screen of any report is for the reader.** Method, conditions and identifiers stay available one click down.
5. **Plain stays plain.** No dashboard, no visual redesign, no disclaimers. Hierarchy and wording do the work.
6. **No new tool until path 3 passes.** Parked items in plan.md stay parked.

## Path 0: secure the base

Everything else changes shared code, so the current state has to be recoverable first.

- Commit the working tree in phase-sized commits that match plan.md.
- Fix the content-browser race. Add a `format` check with the Prettier already installed.
- Run `npm run check` in CI on push.
- Split fast unit tests from browser tests so the inner loop is seconds.

**Exit gate.** Clean `git status`. Twenty consecutive green runs of the full suite. Unit tests alone finish in under five seconds. CI green on main.

## Path 1: one front door

One command with one grammar. The existing scripts become its subcommands; none of the collectors change.

- A single entry point: `wt <tool> <project> [options]`, with the project as an argument rather than an environment variable. The `npm run` names remain as aliases.
- One shared argument parser, one option vocabulary (`--site`, `--pages`, `--devices`, `--run`, `--render`), one exit-code table.
- `wt` alone lists tools; `wt projects` lists records; every `--help` works with no project and exits 0.
- Errors go through one handler: cause, then the command that fixes it. No stack traces outside `--debug`.
- `wt doctor` checks Node, Chromium, the API key and disk space.
- `wt new <id> --url <site>` writes a valid record by asking for the site and reading its sitemap for candidate pages.
- One project record version that covers both paired and live sites.
- Split the README into a one-page quick start and a reference per tool.

**Exit gate.**

- Cold start: from `git clone` to an opened minimal site-check report for a site with no existing record, in under ten minutes, using only the quick start and `--help`.
- An error-path test covers every subcommand with a missing project, an unknown option and a missing prerequisite file. Each prints a next step and no stack trace.
- The option table has no synonyms and no option whose meaning differs between tools.
- The five existing project records load unchanged or through one recorded migration.

## Path 2: runs you can live with

The evidence folder is the product's memory. It should answer questions without `ls`.

- Run names come from the tool and a counter (`2026-11-12-watch-03`). `--run` remains for a deliberate label.
- Every option that takes a run defaults to the latest finished run of the right tool. Hashes pass between tools through the run's own results, not the clipboard.
- `wt status <project>`: latest run per tool with its state, the accepted baseline and its age, open findings, and the next sensible command.
- A generated `projects/<id>/index.html` linking every report, newest first. This is the operator's home page for a job.
- `wt prune <project>`: lists what would go and what is protected (accepted baselines, runs cited by a verification record, the latest of each tool), and deletes only on confirmation. Large release payloads are stored once by hash.
- `wt archive <project>`: one file to back up or hand over, and a restore that is tested.

**Exit gate.**

- The London Potters workflow in [verification-london-potters-workflow-2026-11-12.md](verification-london-potters-workflow-2026-11-12.md) is repeated end to end without typing a run name, a path into `evidence/` or a hash.
- `wt status` returns in under two seconds on London Potters and its "next" line is correct at each step of that repeat.
- After prune, London Potters is under 1 GB and every link in every dated verification record still resolves.
- An archive restored on a clean checkout rebuilds every report offline.

## Path 3: reports a client can act on

Same template, different order and wording.

- Every report opens with three blocks: what was checked, what was found in order of consequence, and what needs a decision. Collection accounting moves to the method section.
- Each finding has a plain statement, why it matters to a visitor, where it occurs and a link to the evidence. Rule identifiers appear in the detail, not the heading. One shared wording table covers axe rules, header checks and discovery checks.
- Dates and durations are written for people. Machine values stay in `results.json`.
- Findings group by cause across pages and devices, so one contrast problem on ten pages is one line.
- `wt share <project> <run>` produces the same kind of portable, single-project bundle the comparison already has, with internal-only material left out by rule.
- The watch report states "nothing changed" in one line when that is true and holds sub-threshold pixel noise below the fold.

**Exit gate.**

- Reader test on each of the five report types, with a real run: a person who has not seen the project reads for two minutes and then names the most important finding and what needs deciding. Three readers; all three succeed on all five.
- The first screen at 1440 by 900 and at 390 by 844 contains no hash, rule identifier, ISO timestamp or run name.
- Every finding type the collectors can emit has an entry in the wording table; a test fails when one is missing.
- A shared bundle opens from a static host with external requests blocked and contains nothing from another project or from `conditions.json`.
- No approval or status disclaimer appears in any shared output.

## Path 4: unattended watch

**Entry gate.** Path 2 passed, and one site is live that the owner would want to hear about within a day.

- A schedule, run by whatever the owner already has running daily. Recommended: a scheduled job on the owner's machine first, since evidence is local.
- One notification per run that needs review, containing the summary line and a link to the report. Silence when nothing changed.
- A per-project noise budget, so routine variation that the manual runs already showed does not alert.
- A missed run is itself reported.

**Exit gate.** Fourteen consecutive days on two sites with no alert on a day with no real change, a seeded defect on each site alerted in the next cycle, and a deliberately skipped run reported.

## Path 5: shared client review

**Entry gate.** Path 3 passed, and a live job where a client must decide on more than fifty URLs or annotate a comparison without the operator in the room.

This is the largest investment and the one deferred decision from phase 4. Decide between the smallest shared store that works (one small hosted key-value store behind a link with a secret) and continuing the file exchange with a better merge. Build the smaller one unless the job shows it is not enough.

**Exit gate.** A real client completes a review round from a link alone, with no file exchanged and no instructions beyond the page. Two people edit the same review and neither loses a decision. The operator pulls the result into a redirect map with one command.

## Order

Paths 0, 1, 2 and 3 run in that order. Path 1 before path 2 because run defaults and `status` hang off the shared entry point; path 3 last of the four because its sharing step needs path 2's run model. Paths 4 and 5 start only when their entry gates are met, in either order.

## Programme exit

The experience work is finished, and attention returns to plan.md's parked tools, when all of these hold on the next real job:

1. The job runs from inventory to accepted watch baseline through `wt` alone, and the operator's friction log for it has no item that appears twice.
2. Returning after two weeks away, the operator answers "where is this job and what is next" from `wt status` without opening a document.
3. Every report sent to the client was sent as produced, with no explanatory covering note needed.
4. Total evidence for the job is backed up and under an agreed size.

## Open decisions

- **Is a second operator in scope?** If yes, the cold-start gate in path 1 is tested on that person and onboarding weight goes up. If no, "two weeks away" is the proxy.
- **Where does a scheduled watch run?** Recommended: the owner's machine until evidence needs to be off it.
- **Who are the three readers for path 3?** They must not have worked on the project.

## Decisions

- 12 November 2026: experience work is organised by the seams between tools, not tool by tool, because each tool already passed its own acceptance.
- 12 November 2026: gates are observed tasks and timings on real projects. A feature existing does not pass a gate.
- 12 November 2026: scheduling and shared storage, both deferred in plan.md, stay deferred behind entry gates rather than being scheduled now.
