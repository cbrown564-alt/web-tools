# wt content

```
wt content <project> [action] [options]
```

Review page decisions and check the redirect map.

| Action    | Meaning                                           |
| --------- | ------------------------------------------------- |
| `prepare` | Build the review page from an inventory (default) |
| `check`   | Check a redirect map over HTTP                    |

| Option              | Meaning                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--inventory <run>` | Inventory run to review. Default: latest                                                                     |
| `--site <id[,id]>`  | Site to use: before, after, live or a competitor id                                                          |
| `--map <file>`      | Redirect map exported from the review page                                                                   |
| `--base <origin>`   | Check the map against this origin instead                                                                    |
| `--allow-partial`   | Check a map that still has undecided pages                                                                   |
| `--run <name>`      | Name the run this command creates, or choose the run it acts on. Default: the next number, or the latest run |

Status: static review, spreadsheet/JSON exchange and an HTTP redirect checker, working as a manual prototype on both reference inventories.

## Prepare a review

Prepare an offline review from a finished inventory. The default reads the selected site's generated inventory pointer, which is the latest finished inventory for that site; `--inventory <run>` pins an older snapshot. London Potters defaults to `before`; a paired record without a default requires `--site`.

```sh
wt content elizabeth-norman
wt content london-potters --site before
wt content london-potters --inventory 2026-11-12-inventory-verified
```

Runs are named `<date>-content-review-NN`. The command writes a new `projects/<id>/evidence/<run>/` folder containing `index.html`, `manifest.json`, conditions and verified copies of available captures. It refuses an existing run name and checks the inventory index hash and each copied image hash. Source inventories are unchanged. Open `index.html` directly or serve its folder on a static host. The page has no external runtime dependency. It contains one project's snapshot. Hosting and access control are separate decisions; this command does not publish it.

## Use the review page

Every URL starts **undecided**. Search, filter by decision and page through the inventory; choose a page, inspect its source facts and switch capture devices. **Fit whole capture** shows the full-page overview; uncheck it to read and scroll at page width, or open the full PNG. Pages without captures show that fact and a source link. Failed or changed image files are not replaced by a blank screenshot. The earlier representative inventories have captures for seven Elizabeth Norman URLs and thirteen London Potters URLs, not every row.

Choose **keep**, **rewrite**, **consolidate** or **remove**, and enter notes. Keep/rewrite retain the URL and expect HTTP 200. Consolidate requires a destination URL or absolute path, with 301 by default or 308. Remove expects 410 by default or an explicitly selected 404. Consolidation targets cannot contain credentials, fragments or sensitive query parameters. Self-redirects, redirect-to-redirect chains and destinations marked for removal are rejected when compiling the map. Editorial choices are never inferred from HTTP status or old client recommendations.

Edits save in that browser for the exact project/inventory fingerprint. Download JSON backups to move or recover them; shared server storage is not configured. Browser storage failure leaves in-memory editing and download available. A conflicting tab change pauses saving and offers download/reload recovery. **Clear decisions** is an explicit reset. Prepared HTML remains a blank decision template: browser edits do not rewrite the files on disk or another person's copy. A new inventory fingerprint starts a separate review.

## Spreadsheet and redirect map exports

**Export spreadsheet (CSV)** downloads UTF-8 CSV with project ID, inventory fingerprint, URL, decision, destination, redirect/removal statuses and notes. Edit the decision fields in a spreadsheet, retain the identity columns, and import the CSV back into the review. CSV imports merge supplied URLs while keeping other choices; JSON backups replace the complete decision set. Foreign inventories, unknown or duplicate URLs, invalid statuses, malformed files and oversized notes are rejected before changing current choices. Exported formula-like cell values are quoted as text; the app never evaluates spreadsheet formulas. Native XLSX files are not supported—save the edited file as CSV.

**Export redirect map** creates portable JSON rules and coverage counts. Undecided pages produce no rule. A map remains partial if any URL is undecided or its source inventory is partial. Incomplete consolidation targets prevent export. The export records intended URL treatment; it does not install redirects or certify rewritten content.

## Check a redirect map

Check an exported map against its source URLs, or translate same-origin source/destination paths to a preview or local origin with `--base`:

```sh
wt content elizabeth-norman check --map /path/to/elizabeth-norman-redirect-map.json
wt content london-potters check --map /path/to/map.json --base https://preview.example
```

The checker accepts only a recorded source site for the selected project. `--base` must be a plain HTTP(S) origin, without a path, credentials, query or fragment. Explicit external destinations retain their own origin. Checks use anonymous GET requests, cancel response bodies and record each hop. Keep/rewrite require an initial 200 without a redirect. Removal requires the exact initial 404/410. Consolidation requires the selected initial 301/308, one hop to the exact destination and a 200 there. Wrong destinations, loops, chains, unexpected origins, transport failures and failed destinations are reported. Literal URL differences, including trailing slashes and queries, matter. The checker measures HTTP treatment, not editorial quality or authenticated journeys.

Partial maps are refused before requests unless `--allow-partial` is explicitly supplied; then only their exported rules are checked and their limited coverage remains in the report. Empty maps cannot be checked. Runs are named `<date>-redirect-check-NN`. The checker writes immutable `report.html`, `results.json`, the checked `map.json` and conditions under a new evidence run. The report opens with what was checked, what was found and what needs a decision. No redirect, removal or source-site content change is applied.

## Exit codes

**0** means preparation succeeded or all supplied checks passed; **2** means rule failures; **1** means setup, validation or runner failure. [Content verification](../verification-content-2026-11-12.md) records real review preparation and the fixture checks; real decisions remain undecided.
