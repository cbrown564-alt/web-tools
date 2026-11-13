# Projects, runs and housekeeping

This page covers the commands that are not a measuring tool (`status`, `index`, `share`, `prune`, `archive`, `restore`, `new`, `projects`, `doctor`), the project record, and the rules every command shares.

## The command

```
wt <tool> <project> [action] [options]
```

Run it as `npx wt`, `npm run wt --` or `node scripts/wt.mjs`. `wt --help` lists the tools and `wt <tool> --help` shows a tool's actions and options. Commands run relative to the repository wherever `wt` is called from. The older npm script names (`npm run site-check`, `watch`, `inventory`, `content`, `release`, `capture`) remain as aliases, and the `PROJECT` environment variable still selects a project when none is given on the command line.

### One option vocabulary

Each option name has one meaning wherever it appears.

| Option                       | Meaning                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--site <id[,id]>`           | Site to use: before, after, live or a competitor id                                                          |
| `--pages <id[,id]>`          | Limit to these recorded pages                                                                                |
| `--devices <desktop,mobile>` | Limit to these devices                                                                                       |
| `--run <name>`               | Name the run this command creates, or choose the run it acts on. Default: the next number, or the latest run |
| `--render [run]`             | Rebuild a saved report without measuring. Default: latest                                                    |

A mistyped option or tool name gets a suggestion; `--sites` is answered with `Use --site`.

### Runs

Every measuring command writes a new folder, a run, under `projects/<id>/evidence/<run>/`. Runs are named `<date>-<tool>-NN`, taking the next free number for that day:

| Command                          | Run name                     |
| -------------------------------- | ---------------------------- |
| `wt site-check`                  | `<date>-site-check-NN`       |
| `wt site-check --tier maximum`   | `<date>-maximum-NN`          |
| `wt watch`                       | `<date>-watch-NN`            |
| `wt inventory`                   | `<date>-inventory-NN`        |
| `wt content`                     | `<date>-content-review-NN`   |
| `wt content check`               | `<date>-redirect-check-NN`   |
| `wt release pack` and the others | `<date>-release-<action>-NN` |

`--run <name>` is optional everywhere. A name is lowercase letters, digits and hyphens, at most 80 characters. Saved runs are never overwritten: naming an existing run is refused with `Leave out --run to use the next free name`.

Later steps use the latest finished run unless told otherwise, and print which run they used:

- `wt watch <project> accept` accepts the latest watch run for the site.
- `wt content <project>` reviews the latest inventory.
- `wt release <project> verify`, `rehearse` and `reverse` take the package, pins, journal and target from the latest package or rehearsal run.
- `--render` with no value rebuilds the latest run of that tool.
- `wt share <project>` bundles the latest report.

Evidence, watch pointers and inventory pointers are ignored by Git. Keep them together; `wt archive` backs them up as one file.

### Reports

Every report opens with three blocks: **What was checked**, **What was found** and **What needs a decision**. Reports are portable HTML with relative evidence links and can be printed to PDF. After every run the command prints the path of the project's page of reports and a `Next:` line.

### Exit codes and errors

| Code | Meaning                                                                         |
| ---- | ------------------------------------------------------------------------------- |
| 0    | Done. Findings may still need review; read the report                           |
| 1    | Could not start or finish: setup, input or runner failure                       |
| 2    | Finished with something to act on: partial collection, failed checks or changes |
| 3    | Watch only: no accepted baseline yet                                            |

Errors print the cause and a `Next:` line naming the command that fixes it:

```
wt site-check: No project named velocty
Next: wt site-check velocity
```

Set `WT_DEBUG=1` to print the stack trace as well. `WT_ROOT=<folder>` points the tools at another folder that holds `projects/`; the tests use it.

## wt status

```
wt status [project]
```

Where a job stands and what to run next. No options.

```sh
wt status
wt status london-potters
```

For each project it lists the latest run of each kind (inventory, content review, redirect check, release package, rehearsal, reversal, form tests, site check, investigation, watch) with its state, age and run name, then any accepted watch baselines. **Needs attention** lists latest runs that are partial, failed, changed, unfinished or waiting for a baseline. The last two lines say why and give the next command.

The next command follows the stage most recently finished, in the order inventory, content review, redirect check, release package, release rehearsal, form tests, site check, watch. Inventory and content stages apply only when the project has an `inventory` block or an inventory run; release stages apply only when `projects/<id>/release.json` exists. With no project, every project is shown.

## wt index

```
wt index <project>
```

Rebuild the project's page of reports. No options.

```sh
wt index london-potters
```

Writes `projects/<id>/index.html`: where the job stands, the next command, accepted baselines, and every run newest first with a link to its report and folder. It is also rebuilt after every run, so this command is only needed after moving or deleting runs by hand.

## wt share

```
wt share <project> [options]
```

Bundle one report for a client, without internal evidence.

| Option           | Meaning                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `--run <name>`   | Name the run this command creates, or choose the run it acts on. Default: the next number, or the latest run |
| `--out <folder>` | Where to write the result                                                                                    |

```sh
wt share velocity
wt share velocity --run 2026-11-13-watch-02
```

Writes `output/share/<project>-<run>/index.html`, or the folder given with `--out`. The default is the latest finished report; `--run` chooses another. The report is first rebuilt from its saved results, so it uses current wording. The bundle holds the report page, the pictures it shows and any linked report pages. Operator-only and internal sections are removed, and links to files that are not shared (results, conditions, traces) become plain text. An existing bundle folder at the same path is replaced. Content-review runs cannot be shared this way; their review page is already a self-contained folder ([content.md](content.md)). The command does not publish anything: upload the folder to a static host, or zip and send it.

## wt prune

```
wt prune <project> [options]
```

List and remove runs nothing depends on.

| Option  | Meaning              |
| ------- | -------------------- |
| `--yes` | Do it without asking |

```sh
wt prune london-potters
wt prune london-potters --yes
```

Without `--yes` it lists what would go and what is kept, with sizes and the reason each kept run is kept, then asks for confirmation; you must type `yes`. When there is no terminal to ask, nothing is changed. Removal cannot be undone, so run `wt archive <project>` first if in doubt.

A run is kept when it is:

- an accepted watch baseline, or the current inventory for a site;
- the latest finished run of its kind (per tier and site);
- cited by name in `README.md` or any Markdown file under `docs/`;
- named in the project's own `project.json`, `release.json` or `maximum.json`;
- used by a kept run (for example a watch's baseline or its `<run>-check` site check, a content review's inventory);
- unfinished, or not a recognised run. These are left for a person to inspect.

Prune also finds files of 16 KB or more in kept runs that are exact copies of one another, as release rehearsals produce, and stores each once with hard links; every path keeps working.

## wt archive

```
wt archive <project> [options]
```

Write one file holding a project's record and evidence.

| Option           | Meaning                   |
| ---------------- | ------------------------- |
| `--out <folder>` | Where to write the result |

```sh
wt archive velocity
```

Writes `output/archives/<project>-<date>.tar.gz` and a `.sha256` file beside it, and prints the SHA-256. The archive holds the project record, pointers and every saved run; the generated `index.html` and run cache are left out. An existing archive of the same name is not overwritten. It needs the system `tar`. Keep the file somewhere other than this disk.

## wt restore

```
wt restore [options]
```

Unpack an archive and rebuild every report offline.

| Option          | Meaning                            |
| --------------- | ---------------------------------- |
| `--from <file>` | Archive file written by wt archive |

```sh
wt restore --from output/archives/velocity-2026-11-13.tar.gz
```

Unpacks into `projects/<id>/`, rebuilds every finished report from its saved results with no network and no browser, and rebuilds the index. It never overwrites: if `projects/<id>` already exists the command stops. Restore in a clean checkout to prove an archive. It exits 2 when any report could not be rebuilt and lists them. Content-review pages and runs without a report are kept as they are.

## wt new

```
wt new <new-id> [options]
```

Create a project record from a live site.

| Option                 | Meaning       |
| ---------------------- | ------------- |
| `--url <https://site>` | The live site |
| `--name <text>`        | Display name  |

```sh
wt new acme --url https://www.acme.example
```

The id is lowercase letters, digits and hyphens, and must not exist already. The site must use HTTPS and answer its home page; the command follows the site's own redirect (for example to `www`) and records that address. It makes one home-page request and reads up to four sitemap documents. It picks the home page plus up to four short top-level paths from the sitemap, or from the home page's navigation links when there is no sitemap, and takes the name from `--name`, the site's `og:site_name` or its title. Without `--url` it asks for the address when run in a terminal. Edit `projects/<id>/project.json` afterwards to change the pages.

The result is a live-site record (version 2) that works with `site-check`, `watch` and `inventory`. A paired comparison record is written by hand ([capture.md](capture.md#add-a-comparison-project)).

## wt projects

```
wt projects
```

List project records. No options. Each line shows the id, its sites, the number of runs and the first site's address.

## wt doctor

```
wt doctor
```

Check Node, Chromium, the API key and disk space. No options.

It checks the Node.js version against `package.json`, that dependencies are installed, that Playwright's Chromium is downloaded, the PageSpeed key, `tar`, free disk space (a note below 5 GB) and that at least one project exists. Missing Node, dependencies or Chromium block the tools and make the command exit 1; the others are notes. Each failed row prints its fix.

## Project record

Each project is a folder under `projects/<id>/`. The folder name and the record's `id` must match.

| Path                     | Holds                                                                        |
| ------------------------ | ---------------------------------------------------------------------------- |
| `project.json`           | The project record (below)                                                   |
| `captures/manifest.json` | Comparison captures: immutable-baseline provenance and screenshot metadata   |
| `evidence/<run>/`        | One folder per run: report, results, conditions and evidence. Ignored by Git |
| `watch/<site>.json`      | Pointer to the accepted watch baseline for a site. Ignored by Git            |
| `inventory/<site>.json`  | Pointer to the current inventory for a site, with its hash and state         |
| `inventory-history.json` | Dated historical URLs, linked from `inventory.history`                       |
| `release.json`           | Release specification ([release.md](release.md#release-specification))       |
| `maximum.json`           | Default maximum-tier profile ([site-check.md](site-check.md#profile))        |
| `index.html`             | Generated page of reports (`wt index`)                                       |

### Version 2: one live site

Written by `wt new`. `kind` is `site-check`; the single site has id `live`.

```json
{
  "version": 2,
  "kind": "site-check",
  "id": "velocity",
  "name": "Velocity",
  "site": {
    "id": "live",
    "label": "Live website",
    "baseUrl": "https://www.researchvelocity.co.uk"
  },
  "devices": {
    "desktop": { "width": 1440, "height": 1050 },
    "mobile": { "width": 390, "height": 844 }
  },
  "pages": [
    { "id": "home", "label": "Home", "path": "/" },
    { "id": "gallery", "label": "Report gallery", "path": "/gallery.html" }
  ]
}
```

`baseUrl` must be HTTPS without credentials. Devices are `desktop` and/or `mobile` with positive integer viewports. At least one page is required; page ids are unique lowercase slugs and paths must stay on the site. A version 2 record works with the checks only; it has no before/after pair, and comparison builds require paired pages and captures.

### Version 1: a before and after pair

Holds paired comparison pages, source URLs, viewports and review wording. The tools address its two sites as `before` and `after`.

```json
{
  "version": 1,
  "id": "research-network",
  "name": "Research Network",
  "labels": {
    "before": "Current website",
    "after": "Proposed redesign",
    "afterNote": "The proposed change"
  },
  "beforeBase": "https://www.research-network.org.uk",
  "afterBase": "https://preview.example",
  "devices": {
    "desktop": { "width": 1440, "height": 1050 },
    "mobile": { "width": 390, "height": 844 }
  },
  "pages": [
    {
      "id": "home",
      "label": "Home",
      "beforePath": "/",
      "afterPath": "/",
      "heading": "Headline shown in the review",
      "summary": "Introduction shown in the review",
      "beforeNote": "What the before capture shows",
      "afterNote": "What the after capture shows"
    }
  ]
}
```

The `labels` block is required. A record needs at least two page pairs. [capture.md](capture.md#add-a-comparison-project) has the rules for comparison wording.

### Optional blocks

- `watch`: assertions, comparison thresholds and masks for the watch; `watch.site` sets the default site of a paired record ([watch.md](watch.md#assertions)).
- `inventory`: `site` sets the default site of a paired record; `seeds` adds public paths to start from; `history` links `inventory-history.json`; `competitors` lists other public sites to crawl; `outputs` identifies the inventory pointer files for later tools ([inventory.md](inventory.md)).

## Reference projects

Five records are checked in: `london-potters` and `research-network` (paired), `velocity`, `unitedstats` (Red Thread) and `elizabeth-norman` (live). The working approach comes from the Elizabeth Norman International, Research Network and London Potters projects. EmDash is the default for new website implementations; each client's identity and content model remain bespoke.

London Potters has completed a [full workflow exercise](../verification-london-potters-workflow-2026-11-12.md): preservation decisions, candidate URL checks, actual Worker/assets file verification and a quiet demo watch repeat. Production release remains blocked by the recorded content, service and recovery work. The [content/order follow-up](../verification-london-potters-content-order-2026-11-12.md) matches the captured live gallery/archive ordering. The [demo service decisions](../verification-london-potters-demo-services-2026-11-12.md) complete demo treatment for all 1,155 recorded URLs, with passing checks and a quiet watch. Real production service/access policies remain open; the source inventory is still partial.

Build one complete loop, prove it on a second project, then extract the shared pattern. Do not create a general platform ahead of that evidence.
