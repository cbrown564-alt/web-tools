# wt inventory

```
wt inventory <project> [options]
```

Crawl a site into one page inventory with captures.

| Option                                   | Meaning                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--site <id[,id]>`                       | Site to use: before, after, live or a competitor id                                                          |
| `--captures <all\|representative\|none>` | Which pages to capture. Default: `all`                                                                       |
| `--capture-limit <n>`                    | Most pages a representative capture selects. Default: 24                                                     |
| `--devices <desktop,mobile>`             | Limit to these devices                                                                                       |
| `--depth <n>`                            | Link levels to follow beyond the sitemap. Default: 2                                                         |
| `--max-urls <n>`                         | Stop after this many URLs. Default: 2000                                                                     |
| `--max-sitemaps <n>`                     | Stop after this many sitemap documents. Default: 40                                                          |
| `--compare <run>`                        | Add a side-by-side sheet against this inventory run                                                          |
| `--run <name>`                           | Name the run this command creates, or choose the run it acts on. Default: the next number, or the latest run |
| `--render [run]`                         | Rebuild a saved report without measuring. Default: latest                                                    |

Status: working as a manual prototype on London Potters and Elizabeth Norman.

## Run a page inventory

The inventory command follows the selected site's sitemap and ordinary HTML links. It records each URL's HTTP status, redirect chain, title, canonical, inferred template group and decoded HTML size, plus publicly visible platform, plugin/theme asset versions, forms and tracker markers. It does not need the PageSpeed key.

```sh
wt inventory london-potters --site before --captures representative
wt inventory elizabeth-norman --captures representative
```

A paired project requires `--site`, unless `inventory.site` in the project record sets a default. A live-site record selects its only site. London Potters defaults to the existing production site (`before`); Elizabeth Norman is a live-site record. The command works with the other records too.

## Capture modes

Capture modes are explicit. **`all` (default)** captures every successful HTML URL on every recorded device. **`representative`** selects recorded pages and then one example of each additional template group, up to `--capture-limit 24` pages. **`none`** collects HTTP inventory and technical observations only. Large inventories can take a long time and substantial disk space in all-page mode. Reports state the chosen mode, selected/eligible page counts, devices and failures; representative coverage is not presented as a capture of every page. Use `--devices mobile` to narrow browser work.

## Crawl bounds

Defaults are link depth 2 (sitemap and explicit seeds at depth 0, then two link levels), 2,000 URLs, 40 sitemap documents, two HTTP workers and at least 250ms between request starts on a site. Robots rules and longer declared crawl delays apply. `--depth`, `--max-urls` and `--max-sitemaps` change the bounds. Hitting a URL/sitemap cap, collection errors, or a failed selected capture makes the run partial. HTTP error statuses such as 404 remain inventory observations rather than disappearing from the counts. The collector stops after rate-limit/service-unavailable responses (429/503). Dated calendar generators, assets, APIs/feeds, action URLs, sensitive parameters and unbounded queries are excluded and counted. Tracking parameters and fragments are removed; slash aliases remain separate URLs with their redirects recorded.

## Output

Runs are named `<date>-inventory-NN`; `--run <name>` chooses a folder and refuses overwriting. Each immutable run writes `inventory.json` (one machine-readable inventory for the selected site), `report.html`, `results.json`, `conditions.json`, `progress.jsonl`, captures and optional historical reconciliation under `projects/<id>/evidence/<run>/`. The report opens with what was checked, what was found and what needs a decision. It has page search, template counts, a technical summary, per-page observations and capture links. Rebuild it offline:

```sh
wt inventory london-potters --render
wt inventory london-potters --render 2026-11-13-inventory-01
```

After a finished run, `projects/<id>/inventory/<site>.json` points to that run's inventory and report, recording its hash and complete/partial state. [`wt content`](content.md) reads this pointer, so it uses the latest finished inventory without being told. The `inventory.outputs` entries in the two reference project records identify those files for later tools. A partial run remains visibly partial; it is not a replacement claim of completeness. Generated inventories and evidence are ignored by Git. Back them up together ([`wt archive`](project.md#wt-archive)). An interrupted process can leave only conditions and an append-only progress file; it does not create a finished inventory pointer.

## Historical URLs

London Potters and Elizabeth Norman also have a dated `inventory-history.json`. The project record links it through `inventory.history`. Those historical URLs are supplied as seeds, subject to the same exclusions and robots rules, and the report compares exact URL sets and historical HTTP outcomes. An old URL absent from a current sitemap is not presumed deleted. Historical counts include redirects and error pages; compare like scopes before interpreting a change in total.

## Competitors and comparison sheets

For a competitor, add its public site to the project's `inventory.competitors`, using a unique lowercase `id`, `label`, HTTPS `baseUrl`, and optional `seeds` array of public paths. Competitor crawls start from their own sitemap, home and seeds; they do not inherit client history or client page paths. Run it with `--site <competitor-id>`. Add `--compare <finished-run-name>` to another inventory run in the same project to produce a portable side-by-side sheet:

```sh
wt inventory elizabeth-norman --site <competitor-id> --captures representative
wt inventory elizabeth-norman --compare <finished-run-name>
```

It copies verified prior captures into the new evidence folder. The columns retain their own URLs and selections; matching row position does not imply equivalent content.

## Technical probe limits

The technical probe reads returned HTML and public asset paths. An asset `ver` value is recorded as an **asset version**, not proof of the installed plugin version. Tracker markers show presence, not delivery. Form actions, methods and field names/types are recorded without field values; no form is submitted. It does not enumerate user records, candidate applications, CVs or authenticated APIs. JavaScript-only links and dynamically inserted forms may be absent from this HTTP inventory. Browser captures block non-GET/HEAD requests and retain the watch's full-page bounds and load-failure reporting. HTML byte sizes exclude images, scripts and other page assets.

## Exit codes

**0** the selected collection completed; **2** partial collection; **1** setup or runner failure. Review reported site findings even when the command exits zero. [Inventory verification](../verification-inventory-2026-11-12.md) records the two reference runs, historical reconciliation and the retained London Potters failures.
