# Content decisions and redirect verification — 12 November 2026

This record describes phase 4's static prototype. [PRODUCT.md](../PRODUCT.md) owns intended behaviour; [README.md](../README.md) owns operation; [plan.md](plan.md) owns phase status and the static-storage decision.

## Real review preparation

The same preparer produced both `2026-11-12-content-review-ready` folders with collector SHA-256 `60d88cf105d5247368651f726dfcdb35f1ac4b90e9be58779f7bf79de9e01c6d`, without source changes between them:

```sh
PROJECT=elizabeth-norman npm run content -- --run 2026-11-12-content-review-ready
PROJECT=london-potters npm run content -- --run 2026-11-12-content-review-ready
```

| Project          | Inventory URLs | Source inventory | Capture files copied | URLs with captures |
| ---------------- | -------------: | ---------------- | -------------------: | -----------------: |
| Elizabeth Norman |            221 | Complete         |                   14 |                  7 |
| London Potters   |          1,155 | Partial          |                   23 |                 13 |

Each review contains its own embedded manifest and browser bundle, plus verified local copies of available captures. Inventory and image hashes were checked during preparation. Source inventories and prior evidence were preserved. London Potters' partial coverage, failed captures and unavailable pages remain visible. The page shows title, URL, observed status, template, byte size, redirects and canonical metadata alongside the decision and notes.

All real editorial decisions start **undecided**. Earlier Liz recommendations and live HTTP statuses were not converted into new editorial decisions. Automated browser edits used separate temporary browser contexts which were discarded. The prepared HTML is a blank review template; no client decision file, hosted database or live redirect configuration was created.

## Complete review loop

`tests/content-browser.test.mjs` exercises the actual bundled review with a labelled local fixture:

- Select a page, inspect and scroll its capture at page width, switch context and retain editable decisions.
- Save a decision and multiline notes; reload and recover them.
- Download JSON and CSV, reset intentionally, restore JSON and merge a spreadsheet.
- Reject a foreign inventory without changing existing choices.
- Reject incomplete/self-referencing consolidation targets; export a valid partial map with correct undecided counts.
- Show missing and failed captures without losing edits.
- Detect another tab's edits; preserve the local copy and reload the saved version explicitly.
- Keep editing and JSON download working when browser storage fails.
- Report a download failure without discarding notes.
- Check responsive layouts at 320, 390, 768 and 1,440px, and axe WCAG 2/2.1 A/AA at desktop and mobile sizes.

Model tests cover inventory identity, duplicate/unknown URLs, exact HTTP rules, partial-source coverage, self-redirects, chains, removed destinations, unsupported/credentialled/fragment destinations, CSV quoting/formula protection and preservation of untrusted inline JSON text. Draft notes and incomplete destinations can be backed up while the reviewer is still editing; invalid destinations cannot become redirect rules.

Both real review pages were also opened directly from their local files with external requests blocked. Four desktop/mobile checks passed with zero axe violations, zero uncaught errors and no page-level horizontal overflow. Each loaded its real capture, exposed 50-page navigation and kept decisions editable. Desktop checks exercised skip-link focus, download and reload persistence. Screenshots were visually inspected; the page-width scrolling control was added so a tall full-page image can be read inside the review. Results and screenshots are under `output/verification/content/`.

## Redirect checker

The checker uses anonymous GET requests and cancels bodies. A specified initial HTTP status is required; retained/removed URLs cannot acquire an unexpected redirect. Consolidations require one hop to the exact expected URL and HTTP 200 at the destination. Same-origin source and destination paths can be translated to an explicitly supplied test origin. Unexpected origins, loops, wrong locations, additional hops, temporary redirects where permanent ones were expected, transport failures and failed destinations are reported rather than accepted as a match.

`tests/content-cli.test.mjs` creates an isolated temporary project and local HTTP server. Its name and reports explicitly identify it as a synthetic fixture. The actual CLI:

- Passed retained 200, consolidation 301 → 200 and removal 410 rules.
- Returned exit 2 for four injected failures: wrong destination, redirect loop, extra hop and the correct destination returning 404.
- Refused a partial map by default (exit 1), and checked its limited rules only after `--allow-partial` was supplied.
- Saved immutable maps, conditions, result JSON and readable reports.

`SAVE_CONTENT_FIXTURES=1 node --test tests/content*.test.mjs` retains the synthetic check evidence under `output/verification/content/check-fixtures/`. Positive and negative reports passed desktop/mobile image/link, overflow and axe checks; layout results are in `output/verification/content/check-layout/`. These are checker tests, not verification of a proposed client release. No real editorial redirect map exists yet because the real decisions remain undecided.

## Repository checks and limits

The six focused content tests passed, and the full suite passed all 32 tests. Full `npm run check` and `PROJECT=london-potters npm run check` passed, including the comparison's existing browser edit/import/reset/PDF recovery flows. The latest full-suite check is `output/check-phase4-final.log`; the paired-project check is `output/check-phase4-london-potters.log`. `npm audit --audit-level=low` found zero vulnerabilities and `git diff --check` passed. No source website was changed, no form was submitted and no redirect was installed.

This is a static manual workflow with local persistence and JSON/CSV exchange. It does not provide server collaboration, authenticated checking, wildcard routes, deployment adapters, native XLSX editing or editorial content verification. Existing representative captures cover only a small subset of inventory URLs; missing captures are explicitly shown. The reviewer must supply the actual decisions. A changed inventory fingerprint starts a separate review; imports do not silently move decisions between snapshots. London Potters' source inventory remains partial, so its exported maps retain that limitation even after every row has a decision.
