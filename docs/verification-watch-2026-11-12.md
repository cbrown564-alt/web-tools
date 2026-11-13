# Post-launch watch verification — 12 November 2026

This record describes engineering verification of phase 2. [PRODUCT.md](../PRODUCT.md) owns intended behaviour; [README.md](../README.md) owns commands and configuration; [plan.md](plan.md) owns phase status and acceptance.

## Saved Liz defects

`tests/watch-liz-replay.test.mjs` exercises the actual capture, assertion, comparison, report and baseline functions against saved public Elizabeth Norman International content sections. Source URLs, archived repair paths and response hashes are in `tests/fixtures/watch/provenance.json`. The source survey-loader omission is documented in Liz's `audit/herefish-survey-2026-10-05/README.md`; gallery CSS loss in `audit/article-gallery-2026-11-10/README.md`; missing September articles in `audit/production-preflight-2026-10-01/README.md`.

The fixture retains the actual repaired loader, gallery rules, all 67 gallery items and the Bell Curve resource listing. Other scripts, styles, forms, frames and inline handlers were removed. Neutral layout and local image stubs make this a bounded replay of real failure mechanisms, rather than a reproduction of the complete production site. The Herefish account is replaced and its script served as an inactive local stub. A browser route guard aborts external requests and the test requires zero external request attempts. No production survey, analytics or form was exercised.

| Replay                          | Expected finding                   | Observed result                                                  |
| ------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| Saved baseline → identical copy | No changes                         | Quiet; zero changed pixels on all three pages                    |
| Remove Herefish loader          | Required script absent             | `herefish-loader` failed, even though screenshots were identical |
| Remove gallery repair CSS       | Grid becomes a vertical stack      | `gallery-layout` failed; visible pixel and dimension changes     |
| Remove Bell Curve article       | New article missing from Resources | `september-article` failed; visible pixel and dimension changes  |
| Restore saved copies            | No remaining changes               | Quiet; zero changed pixels on all three pages                    |

Each defect report refuses baseline acceptance and retains the accepted pointer. `SAVE_WATCH_REPLAY=1 node --test tests/watch-liz-replay.test.mjs` keeps inspectable replay reports in ignored `output/watch-replay/`.

`tests/watch.test.mjs` additionally exercises below-fold lazy images, horizontally off-screen lazy slides, content-visibility layout, broken images, script/style/listing/attribute assertions, unchanged and changed captures, explicit acceptance, idempotent acceptance, refusal of stale commands, image tampering and incomplete runs. Discrete site-check findings retain collection failures while performance score variation does not create change alerts.

## Real project runs

Velocity's public website and Red Thread each use their existing five-page, two-device live record. They have main-heading assertions on all five pages, no image masks, pixel colour threshold 0.15, and allowed changed pixel ratio zero. Each full run includes the minimal site check with the local PageSpeed key. The embedded site-check conditions record machine, versions and measurements; the watch conditions record capture settings, policy hash and collector source hashes.

Initial live runs exposed two collector errors which were corrected before the final runs: horizontally off-screen carousel images were incorrectly included in visible-image waits, and applying content-visibility styles only during screenshot could crop a footer. Layout-affecting styles now apply before measurement and scrolling, finite animations finish before capture, and a screenshot/document height mismatch fails collection. Earlier evidence remains under its original name and is not the completion evidence.

The completion runs are named `2026-11-12-watch-verified` and use watch collector SHA-256 `865c7c4c6884a01134722acd0420e541db87c18cfd83d7c095fb4cfd5fd6131d`, with no code changes between projects. These add bounded recovery for a height change during screenshot: up to three attempts, recorded per capture. Velocity's home and method desktop captures both settled on the second attempt and matched the accepted baseline. All ten Velocity comparisons had zero changed pixels. A persistent mismatch still fails; the preceding `watch-confirm` run demonstrates that refusal.

| Project                    | Full-page captures | Passing assertions | Minimal collection | Total time | Result against accepted baseline                                                       |
| -------------------------- | ------------------ | ------------------ | ------------------ | ---------- | -------------------------------------------------------------------------------------- |
| Velocity                   | 10/10              | 10/10              | Complete           | 92.5s      | Zero visual changes; three added/resolved axe entries                                  |
| Red Thread (`unitedstats`) | 10/10              | 10/10              | Complete           | 74.1s      | Two home video-indicator differences (35 and 1 pixels); no discrete site-check changes |

Completion evidence is in `projects/<id>/evidence/2026-11-12-watch-verified/`, including the embedded minimal checks. Both reports remain `changed` for review: Velocity has three added/resolved axe entries and Red Thread has two video-indicator differences. These runs were not accepted to clear those findings. Velocity's reviewed final run replaces its earlier baseline because the footer is now complete. It records 46 existing discrete findings; Red Thread's accepted `2026-11-12-watch-acceptance` baseline records 71. Acceptance acknowledges those observations, not their resolution. Red Thread's final changes remain unaccepted for review.

The earlier repeats (`2026-11-12-watch-repeat`) were preserved as changed, without accepting them to clear the report. Velocity differences included footer extent and mobile paragraph wrapping. Red Thread's two home captures differed by 64 and 19 pixels around the video loading indicator. These observations do not establish a content deployment or a site regression. Dynamic media, browser font choices and changing content can need human review. The final collector addresses the diagnosed footer issue; video and font variability remain visible rather than being masked.

## Report checks

Reports were opened offline at 1440×1050 and 390×844. Images loaded, relative evidence links resolved, no page-level horizontal overflow or uncaught browser errors occurred, and axe WCAG 2/2.1 A/AA scans found zero violations on the tested reports. This includes a failed-gallery report, a quiet report, both live baseline reports and both completion reports. The final eight desktop/mobile report checks are recorded in `output/verification/watch/results.json`. The captures themselves retain their source-site accessibility findings. Contact sheets of all twenty live baseline captures were reviewed. Printable reports were rendered to PDF and a page image inspected; screenshots are overview references in print with links to full PNGs in HTML.

## Checks and limits

`npm run check` and `PROJECT=london-potters npm run check` passed: 21 tests, static builds, capture-manifest checks, and the browser review/edit/import/reset/PDF success and failure flows. Logs: `output/check-phase2-research-network-verified.log` and `output/check-phase2-london-potters-verified.log`. The content-visibility fixture and the three Liz replays also passed focused checks after adding capture recovery. `npm audit --audit-level=low` found zero vulnerabilities. `git diff --check` passed. A scan found no local PageSpeed key in source or live-project evidence. `.env`, generated evidence and baseline pointers are ignored by Git. Baseline acceptance changes only the selected local pointer; it preserves old evidence and compares the pointer seen during collection to prevent stale acceptance.

The bounded prototype provides manual capture → review → accept → repeat. No scheduled job, notification service or hosted backend was configured. No source website was modified. Captures cover vertically scrolling public pages, not every carousel state, authenticated page or interaction. Pages above 50,000px, 24 million pixels or 150 scroll steps fail rather than being truncated. Script presence is not delivery verification; automated findings are not a human accessibility or security certification. Baselines may include existing findings, which remain in the linked minimal report.
