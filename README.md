# Web Tools

Reusable tools for preparing, reviewing, delivering and launching bespoke websites. The working approach comes from the Elizabeth Norman International, Research Network and London Potters projects.

## Direction

Use one project record to produce consistent client material: website comparisons, content decisions, migration evidence, handover instructions and launch media. EmDash is the default for new website implementations; each client's identity and content model remain bespoke. The comparison tool itself is static and does not require a CMS.

## Document owners

- [PRODUCT.md](PRODUCT.md) owns intended behaviour, scope, priorities and prototype acceptance criteria.
- [docs/plan.md](docs/plan.md) owns what is built next, in what order, and what done means for each tool.
- [docs/experience.md](docs/experience.md) owns the work on operator and reader experience, with its exit gates.
- This README owns repository navigation, setup, commands and operational instructions.
- Source code and tests own implementation facts. Capture manifests own image provenance. Dated verification records describe checks, not client acceptance.

## Planned tools

1. Before-and-after comparison: hosted review and side-by-side PDF. Working on two projects.
2. Site check: performance, cache, accessibility, security and discovery checks. Minimal and standard are working; maximum is a bounded investigation prototype with real runs on Velocity live and the Research Network demonstration.
3. Post-launch watch: full-page captures, project assertions, minimal checks and explicit baseline acceptance. Working as a manual prototype on Velocity and Red Thread.
4. Page inventory and discovery kit: crawl, captures and a technical probe. Working as a manual prototype on London Potters and Elizabeth Norman.
5. Content decisions and redirects: static review, spreadsheet/JSON exchange and an HTTP redirect checker. Working as a manual prototype on both reference inventories.
6. Release kit and form tests: fixed-file packages, backup restore, selective reversal and local capture-inbox tests. Working as a local manual prototype on two static review bundles.

The EmDash starter and promo studio are parked. [docs/plan.md](docs/plan.md) has the detail, order and acceptance for each.

Build one complete loop, prove it on a second project, then extract the shared pattern. Do not create a general platform ahead of that evidence.

## Current work

The before-and-after tool is the first full working prototype. It now runs from two project records: Research Network (a proposed redesign) and London Potters (an EmDash demonstration that keeps the existing design). Neither is client-approved or launched; inclusion here does not imply either.

The prototype is implemented in this repository with a static build suitable for ordinary web hosting. Publishing a client-facing site is a separate action. Setup and verification commands follow below.

London Potters has also completed a [full workflow exercise](docs/verification-london-potters-workflow-2026-11-12.md): preservation decisions, candidate URL checks, actual Worker/assets file verification and a quiet demo watch repeat. Production release remains blocked by the recorded content, service and recovery work.

The [content/order follow-up](docs/verification-london-potters-content-order-2026-11-12.md) matches the captured live gallery/archive ordering. The [demo service decisions](docs/verification-london-potters-demo-services-2026-11-12.md) complete demo treatment for all 1,155 recorded URLs, with passing checks and a quiet watch. Real production service/access policies remain open; the source inventory is still partial.

## Run the comparison

Requires Node.js 22.19+ (verified with Node.js 24) and npm.

```sh
npm ci
npm run dev
```

Open the printed local URL, normally `http://127.0.0.1:4173`. Comparison commands work on one paired project, chosen with the `PROJECT` environment variable; the default is `research-network`. For example, `PROJECT=london-potters npm run dev`. Choose a page, switch desktop/mobile or toggle views, and enlarge either screenshot to inspect it. The complete capture fits the available screen automatically; choose **Original size** only when you want to scroll through pixel-level detail. **Edit notes** changes that page's headline, introduction and before/after explanations. Notes persist in browser storage; **Project notes** downloads/imports a JSON backup and offers an explicit reset.

**Export PDF** downloads every page pair for the selected device, with current notes, source links and capture dates. It generates the PDF in the browser; no notes or screenshots are sent to a rendering service. The PDF uses A3 landscape, one pair per page. At A4 print size, screenshot text will be smaller; use A3 or inspect digitally for detail.

## Build and host

```sh
npm run build
npm run preview
```

Upload the contents of `dist/` to any static host. A build contains exactly one project (`PROJECT=london-potters npm run build`), so one client's review never ships another client's captures. The build works at a domain root or beneath a path such as `/review/`. It includes screenshots and fonts locally; neither source website is needed for review or export. Serve it over HTTP(S), not by opening `index.html` as a `file://` URL. There are no server secrets, runtime database or CMS requirements.

`npm run package` builds `output/<project>-review-static.tar.gz` using the system `tar` command. Extract it into the hosting directory. This command does not publish anything. There is currently no configured public deployment.

The prototype carries `noindex, nofollow`; this discourages indexing but is not access control. Choose the intended audience in the host's own settings when publishing.

## Run a site check

The site checker reads the project records. London Potters and Research Network have paired comparison records (version 1). Velocity and Red Thread (`unitedstats`) have live-site records (version 2), with one site and no invented before/after pair. Velocity covers its public website, not the separate research app. Live-site records work with `site-check`; comparison builds require paired pages and captures. Put `PAGESPEED_INSIGHTS_API_KEY=your-key` in a plain-text `.env` file at the repository root (see `.env.example`). The CLI loads it automatically; `.env` and `.env.*` are ignored by Git. The key stays in the local command and is sent only to Google, in a request header. Never give it a `VITE_` prefix, which would expose it to browser code.

```sh
PROJECT=london-potters npm run site-check -- --tier minimal
PROJECT=research-network npm run site-check -- --tier standard --modules performance,cache
PROJECT=velocity npm run site-check -- --tier minimal
PROJECT=unitedstats npm run site-check -- --tier minimal
```

Minimal collects one PageSpeed Insights test per available page/device, paired cache timings, axe accessibility results, security headers/HTTP redirects and discovery metadata. Standard uses three serial local Lighthouse runs with rotated site order and median/range results, cold/repeat browser transfers, bounded sitemap cache samples, keyboard probes, form destinations, TLS/email records, sharing metadata and internal-link checks. Standard performance uses the project viewport; PageSpeed uses Google's own mobile/desktop presets, saved in the evidence. Neither tier submits forms.

Use `--pages home,gallery` or `--devices mobile` for a smaller run; omitted filters cover every recorded page and device on both sites. Use `--sites after` to check only one side of a paired record. Run folders have a date and unique suffix; `--run 2026-11-12-check-one` chooses a name explicitly and refuses any existing folder. A page that fails availability checks (including a missing visible main heading) is skipped and reported. Exit code 0 means collection completed, not that the site has no problems; 2 means partial collection and 1 means setup or runner failure.

Each run writes ignored local files under `projects/<id>/evidence/<run>/`: `report.html`, `results.json`, `conditions.json`, and full performance results. Open the report locally or serve that folder with a static server. Its evidence links are relative, and the report can be printed to PDF. Rebuild it without network requests:

```sh
PROJECT=london-potters npm run site-check -- --render projects/london-potters/evidence/<run>
```

Reports record collection failures, automated findings and checks needing review. Keyboard probes support recognised skip links and menu toggles; visual focus and unrecognised interactions still need human review. Sitemap sampling is limited to six XML documents and twelve URLs per site, and discovery tests at most fifty internal links per page. DNS checks use the exact site hostname with `www` removed; preview domains may not send email. DKIM needs a known selector and is reported as untested. Real visitor data is included when Google returns it; missing data is not a failure, and Google plans to remove it from this API. No CrUX integration is implemented yet. [Site-check verification](docs/verification-site-check-2026-11-12.md) records the accepted runs, historical reconciliation, report review and known limits.

### Investigate with the maximum tier

Maximum answers a named performance question. It uses an investigation profile rather than running the standard checks more often; `--modules` is not accepted for this tier. The supplied profiles test an observed font request as a **browser-only diagnostic ablation**, not a proposed production removal:

```sh
PROJECT=velocity npm run site-check -- --tier maximum --sites live --run maximum-new
PROJECT=research-network npm run site-check -- --tier maximum --sites after --run maximum-new
```

The second command checks the Research Network demonstration only. Velocity remains live-only. Neither command creates a before/after pair or changes a website. Maximum runs locally in Chromium and does not call PageSpeed Insights, so it does not need the API key. Avoid running concurrent audits or heavy builds while collecting comparative timings.

The default profile is `projects/<id>/maximum.json`; use `--profile <file>` to choose another. Its project ID must match. `--sites` must retain every site named by an experiment. `--devices mobile` restricts browser samples, while the crawl remains one HTTP collection per selected site. Journey pages come from the profile, so `--pages` is refused. A minimal profile shape is:

```json
{
  "version": 1,
  "projectId": "velocity",
  "question": "What contributes to homepage-to-gallery readiness?",
  "repetitions": 3,
  "crawl": { "depth": 2, "maxUrls": 2000, "maxSitemaps": 40 },
  "journeys": [
    {
      "id": "home-gallery",
      "label": "Open the gallery",
      "steps": [
        { "page": "home", "ready": "h1" },
        {
          "page": "gallery",
          "via": "a[href='/gallery.html']:visible",
          "ready": "h1"
        }
      ]
    }
  ],
  "parity": {
    "selectors": ["h1", "header", "main"],
    "maxGeometryDeltaPx": 1,
    "maxPixelChangeRatio": 0.001
  },
  "experiments": []
}
```

An empty experiment list is allowed and leaves cause/fix unresolved. Each step names a recorded project page and an expected visible element. Without `via`, the browser navigates directly; with it, the selector must choose a same-tab anchor whose destination matches the recorded next page. There is no arbitrary script, form submission, input typing or general button-click action. Use precise readiness selectors for the actual content being investigated; a heading alone is a limited check.

An experiment names a journey, a question and explicit effect thresholds. **Ablation** suppresses exact resource URLs/types in candidate samples of the same recorded site:

```json
{
  "id": "primary-font",
  "kind": "ablation",
  "site": "live",
  "journey": "home-gallery",
  "question": "Does this observed font request contribute to readiness?",
  "block": [
    { "url": "https://example.com/observed-font.woff2", "type": "font" }
  ],
  "minEffectMs": 100,
  "minEffectRatio": 0.1
}
```

Replace the example URL with an exact request observed on the chosen site; the supplied profiles contain the requests observed during preparation. Missing or changed assets must leave the intervention unproven. Resource types are `script`, `stylesheet`, `font` or `image`; documents cannot be ablated. **Comparison** instead names `"kind": "comparison", "baselineSite": "before", "candidateSite": "after"`, with the same journey/question/threshold fields and no block list. Both sites must exist in the selected record. A deployment comparison retains content/code/cache confounding and cannot automatically establish a cause.

The HTTP collector reuses inventory discovery and exclusions: robots, sitemaps and ordinary links within the configured depth, with action/export/sensitive-query and unbounded calendar URLs excluded. It attempts every discovered in-scope URL up to the stated bounds, rather than the standard tier's twelve-URL sample. Successful HTML URLs get a repeat probe with response headers, final-hop first-byte time and body hash. This timing excludes crawler pacing but is not a browser navigation time. Cache groups retain reported header states; missing headers mean unknown. A repeated URL is not assumed to hit cache. Limits, pending URLs, failed pages and changed bodies remain visible. An HTTP 429/503 stops remaining work; unavailable robots or source pages remain failures.

Browser observations precede experiments. A failed initial journey prevents repeating that journey as an experiment. Every experimental repetition alternates order (baseline/candidate, candidate/baseline, baseline/candidate); repetitions are 3–9. Every sample uses a fresh context, disabled browser HTTP cache, blocked service workers/WebSockets, the recorded viewport, reduced motion and no imposed CPU/network throttling. Non-GET/HEAD browser requests and off-journey top-level navigation are blocked. Origin/CDN caches can still be primed by earlier requests.

Ready time is the **sum of step initiation-to-readiness times**: expected element visible, fonts loaded and visible images complete. It excludes evidence writing between steps and includes scrolling/click overhead when a link is used. All samples retain Chrome performance traces with timeline, V8 profiling, loading and actual screenshot events. Tracing adds overhead. Observed LCP/CLS stop at readiness, and SPA navigation metrics can refer to the original document; these are not field Core Web Vitals, INP measurements or mobile-hardware timings.

Parity compares selected element counts, tag/text identity, geometry, document height and unmasked viewport PNG pixels at every step. The pixel comparison uses pixelmatch threshold 0.1 plus the profile's maximum changed-pixel ratio. Missing selectors, changed counts/content, over-500-element truncation, dimensions or tolerances fail parity. This proves only the selected coverage, not full-page or functional equivalence. Font suppression can change layout; such a result cannot qualify as a clean improvement.

Reports contain numbered **confirmed**, **strongly supported** or **unresolved** findings. Confirmed describes directly collected facts. Strongly supported requires all alternating pairs, positive effect thresholds met on every pair, the resource observed successfully in each baseline and blocked in each candidate, and every parity check passing. It supports the narrow ablation result, not production removal or a proven deployable fix. Variable, incomplete or confounded results remain unresolved. A complete collection can still have unresolved findings.

Each immutable evidence folder contains `profile.json`, `conditions.json`, `results.json`, per-site crawl JSON/progress, per-sample network/step results, viewport captures, Chrome trace JSON and up to 24 genuine trace filmstrip frames with timestamps. `evidence-map.json` records file hashes; reports link every artifact and expose first-pair filmstrips. Traces stop at a 100 MB limit or reported event loss with a partial result. Open a downloaded performance trace in the local Chrome DevTools Performance panel. Keep traces, captures and reports together as internal public-page evidence; review them before sharing. The report rebuild command above also recognises maximum runs and makes no requests. The evidence map identifies files relative to the saved run; it is not a signed attestation.

Maximum shares the existing exit codes: **0** collection complete, **2** partial, **1** setup/runner failure. [Maximum-tier verification](docs/verification-maximum-2026-11-12.md) records the controlled fixture, real runs and coverage limits.

### Run a post-launch watch

The watch captures every recorded page on desktop and mobile, checks the project's assertions, runs the minimal site check using the local PageSpeed key, and compares with the last accepted baseline. It runs by hand; scheduling and notifications are not configured.

```sh
PROJECT=velocity npm run watch
PROJECT=unitedstats npm run watch
PROJECT=london-potters npm run watch -- --site after
```

The first run needs a baseline. Open the printed report, review the captures and findings, then accept that particular run:

```sh
PROJECT=velocity npm run watch -- accept --run <reviewed-run-name>
PROJECT=velocity npm run watch
```

Each run writes `results.json`, `conditions.json`, PNG captures, difference images and a portable `report.html` under `projects/<id>/evidence/<run>/`. The nested `site-check/` folder contains its full minimal report and evidence. The report puts changed captures side by side and lists failed assertions and new/resolved site-check findings. Existing findings remain in the linked minimal report. Acceptance records a local pointer under `projects/<id>/watch/<site>.json`; both watch state and evidence are ignored by Git. Keep these folders together or back them up to retain the accepted baseline. Saved runs are never overwritten. A stale accept command, failed assertion, failed capture, incomplete site check or changed project policy is refused.

Use `--pages home,gallery`, `--devices mobile` and `--run unique-name` to choose scope. Paired records require `--site before|after`; a live record selects its only site. One baseline exists per site, so changing page/device scope, viewports, assertion settings or whether the minimal check is included requires reviewing a fresh baseline. `--skip-site-check` explicitly selects a visual/assertion-only run and labels the omission. It is useful for local fixtures, not equivalent to the complete watch. `PROJECT=velocity npm run watch -- --render <run-name>` rebuilds HTML offline without collecting again or changing acceptance.

Exit codes: **0** unchanged, accepted, or rendered; **3** first/new baseline required; **2** changes or failures needing review; **1** setup failure. Acceptance acknowledges the observed state; it does not certify the site healthy. The watch compares discrete accessibility, security and discovery findings, including counts of affected accessibility elements. Performance scores and cache timings remain evidence rather than generating alerts for routine measurement variation.

Add a `watch` object to the project record to configure assertions. Each assertion has a unique `id`, a recorded `page`, a CSS `selector`, and optionally a `device`:

```json
{
  "watch": {
    "pixelThreshold": 0.15,
    "maxChangedRatio": 0,
    "masks": [],
    "assertions": [
      {
        "id": "heading",
        "page": "home",
        "type": "visible",
        "selector": "main h1"
      },
      {
        "id": "survey",
        "page": "home",
        "type": "script",
        "selector": "script[src$='/scripts/hf.js']"
      },
      {
        "id": "latest-post",
        "page": "resources",
        "type": "listing",
        "selector": ".resource-row",
        "items": ["Expected article title"]
      },
      {
        "id": "gallery",
        "page": "gallery",
        "type": "style",
        "selector": ".gallery",
        "property": "display",
        "equals": "grid"
      },
      {
        "id": "sharing-title",
        "page": "home",
        "type": "attribute",
        "selector": "meta[property='og:title']",
        "attribute": "content",
        "equals": "Expected title"
      }
    ]
  }
}
```

Use only pages and selectors that exist in that project's record and website. `visible` supports `minCount` (default 1); `script` checks presence of a script element, not service delivery; `listing` checks expected text among visible matches; `style` compares a computed CSS property; `attribute` compares an exact attribute value. Assertions run after navigation and again after the full-page capture. Velocity and Red Thread initially assert their main headings; no unverified third-party script requirements were added.

Capture scrolls vertically to load visible lazy images and waits for fonts and images. It stops with a reported failure above 50,000px height, 24 million pixels, or 150 scroll steps; it never saves a truncated baseline. If the document changes height during a screenshot, it retries up to three captures, recording the attempt count; a persistent mismatch fails. Horizontally off-screen carousel slides are outside this capture. CSS animations are disabled and reduced motion requested; video, JavaScript-driven motion, changing content and browser/font differences may still require review. No clock or content is silently frozen. Anti-alias differences are ignored; the pixel colour threshold defaults to 0.15 and any remaining changed pixel or dimension change requires review. Explicit `masks` cover configured selectors in both captures; use them sparingly because masked changes become invisible. Mask matches and comparison settings are recorded. No masks are configured for the two live records.

## Run a page inventory

The inventory command follows the selected site's sitemap and ordinary HTML links. It records each URL's HTTP status, redirect chain, title, canonical, inferred template group and decoded HTML size, plus publicly visible platform, plugin/theme asset versions, forms and tracker markers. It does not need the PageSpeed key.

```sh
PROJECT=london-potters npm run inventory -- --site before --captures representative
PROJECT=elizabeth-norman npm run inventory -- --captures representative
```

A paired project requires `--site`, unless `inventory.site` sets a default. A live-site record selects its only site. London Potters defaults to the existing production site (`before`); Elizabeth Norman is a live-site record. The command works with the other records too.

Capture modes are explicit. **`all` (default)** captures every successful HTML URL on every recorded device. **`representative`** selects recorded pages and then one example of each additional template group, up to `--capture-limit 24` pages. **`none`** collects HTTP inventory and technical observations only. Large inventories can take a long time and substantial disk space in all-page mode. Reports state the chosen mode, selected/eligible page counts, devices and failures; representative coverage is not presented as a capture of every page. Use `--devices mobile` to narrow browser work.

Defaults are link depth 2 (sitemap and explicit seeds at depth 0, then two link levels), 2,000 URLs, 40 sitemap documents, two HTTP workers and at least 250ms between request starts on a site. Robots rules and longer declared crawl delays apply. `--depth`, `--max-urls` and `--max-sitemaps` change the bounds. Hitting a URL/sitemap cap, collection errors, or a failed selected capture makes the run partial. HTTP error statuses such as 404 remain inventory observations rather than disappearing from the counts. The collector stops after rate-limit/service-unavailable responses (429/503). Dated calendar generators, assets, APIs/feeds, action URLs, sensitive parameters and unbounded queries are excluded and counted. Tracking parameters and fragments are removed; slash aliases remain separate URLs with their redirects recorded.

Each immutable run writes `inventory.json` (one machine-readable inventory for the selected site), `report.html`, `results.json`, `conditions.json`, `progress.jsonl`, captures and optional historical reconciliation under `projects/<id>/evidence/<run>/`. `--run unique-name` chooses a folder and refuses overwriting. The report has page search, template counts, a technical summary, per-page observations and capture links. Rebuild it offline with `PROJECT=<id> npm run inventory -- --render <run-name>`.

After a finished run, `projects/<id>/inventory/<site>.json` points to that run's inventory and report, recording its hash and complete/partial state. The `inventory.outputs` entries in the two reference project records identify those files for later tools. A partial run remains visibly partial; it is not a replacement claim of completeness. Generated inventories and evidence are ignored by Git. Back them up together. An interrupted process can leave only conditions and an append-only progress file; it does not create a finished inventory pointer.

London Potters and Elizabeth Norman also have a dated `inventory-history.json`. The project record links it through `inventory.history`. Those historical URLs are supplied as seeds, subject to the same exclusions and robots rules, and the report compares exact URL sets and historical HTTP outcomes. An old URL absent from a current sitemap is not presumed deleted. Historical counts include redirects and error pages; compare like scopes before interpreting a change in total.

For a competitor, add its public site to the project's `inventory.competitors`, using a unique lowercase `id`, `label`, HTTPS `baseUrl`, and optional `seeds` array of public paths. Competitor crawls start from their own sitemap, home and seeds; they do not inherit client history or client page paths. Run it with `--site <competitor-id>`. Add `--compare <finished-run-name>` to another inventory run in the same project to produce a portable side-by-side sheet. It copies verified prior captures into the new evidence folder. The columns retain their own URLs and selections; matching row position does not imply equivalent content.

The technical probe reads returned HTML and public asset paths. An asset `ver` value is recorded as an **asset version**, not proof of the installed plugin version. Tracker markers show presence, not delivery. Form actions, methods and field names/types are recorded without field values; no form is submitted. It does not enumerate user records, candidate applications, CVs or authenticated APIs. JavaScript-only links and dynamically inserted forms may be absent from this HTTP inventory. Browser captures block non-GET/HEAD requests and retain the watch's full-page bounds and load-failure reporting. HTML byte sizes exclude images, scripts and other page assets.

Exit codes: **0** the selected collection completed; **2** partial collection; **1** setup or runner failure. Review reported site findings even when the command exits zero. [Inventory verification](docs/verification-inventory-2026-11-12.md) records the two reference runs, historical reconciliation and the retained London Potters failures.

## Content decisions and redirects

Prepare an offline review from a finished inventory. The default reads the selected site's generated inventory index; `--inventory <inventory-run-name>` pins an older snapshot. London Potters defaults to `before`; a paired record without a default requires `--site`.

```sh
PROJECT=elizabeth-norman npm run content
PROJECT=london-potters npm run content -- --site before
PROJECT=london-potters npm run content -- --inventory 2026-11-12-inventory-verified --run review-one
```

The command writes a new `projects/<id>/evidence/<run>/` folder containing `index.html`, `manifest.json`, conditions and verified copies of available captures. It refuses an existing run name and checks the inventory index hash and each copied image hash. Source inventories are unchanged. Open `index.html` directly or serve its folder on a static host. The page has no external runtime dependency. It contains one project's snapshot. Hosting and access control are separate decisions; this command does not publish it.

Every URL starts **undecided**. Search, filter by decision and page through the inventory; choose a page, inspect its source facts and switch capture devices. **Fit whole capture** shows the full-page overview; uncheck it to read and scroll at page width, or open the full PNG. Pages without captures show that fact and a source link. Failed or changed image files are not replaced by a blank screenshot. The earlier representative inventories have captures for seven Elizabeth Norman URLs and thirteen London Potters URLs, not every row.

Choose **keep**, **rewrite**, **consolidate** or **remove**, and enter notes. Keep/rewrite retain the URL and expect HTTP 200. Consolidate requires a destination URL or absolute path, with 301 by default or 308. Remove expects 410 by default or an explicitly selected 404. Consolidation targets cannot contain credentials, fragments or sensitive query parameters. Self-redirects, redirect-to-redirect chains and destinations marked for removal are rejected when compiling the map. Editorial choices are never inferred from HTTP status or old client recommendations.

Edits save in that browser for the exact project/inventory fingerprint. Download JSON backups to move or recover them; shared server storage is not configured. Browser storage failure leaves in-memory editing and download available. A conflicting tab change pauses saving and offers download/reload recovery. **Clear decisions** is an explicit reset. Prepared HTML remains a blank decision template: browser edits do not rewrite the files on disk or another person's copy. A new inventory fingerprint starts a separate review.

**Export spreadsheet (CSV)** downloads UTF-8 CSV with project ID, inventory fingerprint, URL, decision, destination, redirect/removal statuses and notes. Edit the decision fields in a spreadsheet, retain the identity columns, and import the CSV back into the review. CSV imports merge supplied URLs while keeping other choices; JSON backups replace the complete decision set. Foreign inventories, unknown or duplicate URLs, invalid statuses, malformed files and oversized notes are rejected before changing current choices. Exported formula-like cell values are quoted as text; the app never evaluates spreadsheet formulas. Native XLSX files are not supported—save the edited file as CSV.

**Export redirect map** creates portable JSON rules and coverage counts. Undecided pages produce no rule. A map remains partial if any URL is undecided or its source inventory is partial. Incomplete consolidation targets prevent export. The export records intended URL treatment; it does not install redirects or certify rewritten content.

Check an exported map against its source URLs, or translate same-origin source/destination paths to a preview or local origin with `--base`:

```sh
PROJECT=elizabeth-norman npm run content -- check --map /path/to/elizabeth-norman-redirect-map.json
PROJECT=london-potters npm run content -- check --map /path/to/map.json --base https://preview.example
```

The checker accepts only a recorded source site for the selected project. `--base` must be a plain HTTP(S) origin, without a path, credentials, query or fragment. Explicit external destinations retain their own origin. Checks use anonymous GET requests, cancel response bodies and record each hop. Keep/rewrite require an initial 200 without a redirect. Removal requires the exact initial 404/410. Consolidation requires the selected initial 301/308, one hop to the exact destination and a 200 there. Wrong destinations, loops, chains, unexpected origins, transport failures and failed destinations are reported. Literal URL differences, including trailing slashes and queries, matter. The checker measures HTTP treatment, not editorial quality or authenticated journeys.

Partial maps are refused before requests unless `--allow-partial` is explicitly supplied; then only their exported rules are checked and their limited coverage remains in the report. Empty maps cannot be checked. The checker writes immutable `report.html`, `results.json`, the checked `map.json` and conditions under a new evidence run. Exit **0** means preparation succeeded or all supplied checks passed; **2** means rule failures; **1** means setup, validation or runner failure. No redirect, removal or source-site content change is applied. [Content verification](docs/verification-content-2026-11-12.md) records real review preparation and the fixture checks; real decisions remain undecided.

## Release kit and form tests

This is a local rehearsal tool. Elizabeth Norman’s supplied `release.json` packages its phase-4 **static content-review bundle**. London Potters’ current specification packages the local **Worker modules and static assets** staged by its complete workflow run. The latter is a pinned code/assets artifact, not a Workers deployment adapter or database/media backup. Earlier phase-5 review-bundle runs remain historical evidence. Each run gets an unused `projects/<id>/evidence/<run>/` folder with a portable HTML report, JSON results, conditions/source hashes and a ten-area launch checklist. All checklist areas start pending, with an owner and evidence still to supply.

### Package, verify and rehearse

`projects/<id>/release.json` names a candidate directory within that project and an explicit file list:

```json
{
  "version": 1,
  "projectId": "elizabeth-norman",
  "platform": "static-files",
  "source": "evidence/2026-11-12-content-review-ready",
  "files": ["index.html", "manifest.json", "captures/example.png"],
  "delete": []
}
```

Use the actual supplied specifications for the current bundles; the short example above only illustrates the schema. There are no globs. Deletions must also be explicit. The packer rejects traversal, symlinks, special files, case collisions and sensitive paths including `.env*`, `.git`, `wp-config.php`, SQL dumps and private keys. Only distribute deliberately selected public files.

```sh
PROJECT=elizabeth-norman npm run release -- pack --run release-package-new
PROJECT=elizabeth-norman npm run release -- verify \
  --archive projects/elizabeth-norman/evidence/release-package-new/package.tar.gz \
  --sha <trusted-archive-sha256>
PROJECT=elizabeth-norman npm run release -- verify \
  --package projects/elizabeth-norman/evidence/release-package-new/package \
  --sha <trusted-manifest-sha256>
PROJECT=elizabeth-norman npm run release -- rehearse \
  --package projects/elizabeth-norman/evidence/release-package-new/package \
  --sha <trusted-manifest-sha256> \
  --baseline projects/elizabeth-norman/evidence/2026-11-12-content-acceptance \
  --run release-rehearsal-new
```

The package report and `results.json` record two different pins: the archive SHA-256 identifies the compressed transport bytes; the manifest SHA-256 identifies the operations and their payload hashes/modes. Retain trusted pins separately from transferred bytes. Verify the archive before extracting a transported copy into a new empty directory, then verify its extracted `package/` folder. Archive verification never extracts files. Folder verification rejects missing, changed and unexpected payload files. A hash establishes identity relative to its trusted pin; it does not approve the contents or authenticate a sender.

Rehearsal first copies the baseline into a fresh, explicitly marked local target. It snapshots regular-file contents and modes, restores that snapshot into another fresh directory, and verifies that restore **before** applying the package. Every changed file gets a before/after journal and a saved original; unchanged files are skipped. The runner then creates a synthetic incoming record, reverses the selected changes, and verifies both original files and preservation of the incoming record. It leaves `target/`, `restore/`, `backup/` and `journal/` available for inspection. No original source directory or CMS is changed.

Reversal preflights all touched files and refuses unexpected drift before changing any. It restores only selected originals, removes only selected newly created files, and preserves unrelated incoming files. A failed application records the available journal pin for recovery. A repeat reversal is safe when the selected files are already original, and creates a new evidence record:

```sh
PROJECT=elizabeth-norman npm run release -- reverse \
  --journal projects/elizabeth-norman/evidence/release-rehearsal-new/journal \
  --sha <journal-sha256-from-results> \
  --target projects/elizabeth-norman/evidence/release-rehearsal-new/target \
  --run release-reversal-new
```

Only this project's marked disposable targets are accepted. This is a regular-file rehearsal, not a deployment adapter or full server backup: ownership, ACLs, extended attributes, empty directories, databases and media stores are outside its restore proof. Its lock coordinates this tool, not arbitrary external writers. Interrupted-write tests exercise the saved journal; they do not establish power-loss durability. Stop and investigate conflicts rather than replacing the target with an old whole-tree copy.

### Marked form delivery and recovery

```sh
PROJECT=elizabeth-norman npm run release -- forms --run local-forms-new
PROJECT=london-potters npm run release -- forms --run local-forms-new
```

By default these commands start an isolated loopback form and capture inbox, then close them after testing. They use synthetic identities, `test@example.invalid`, unique `WEBTOOLS-TEST-<UUID>` markers and generated DOCX attachments. They do not visit either live client form or send staff email.

Nine cases run on desktop and mobile: ordinary delivery, no attachment, required-field validation, network loss, HTTP 503, malformed success response, receipt with a lost confirmation, oversized upload and disallowed extension. The harness independently reads the capture inbox, checks the intended recipient, fields and attachment hash, then deletes only its marked record and verifies its absence. A seeded unrelated fixture record must survive. Failures preserve the message, focus the error and allow manual retry. For a lost confirmation, an existing receipt suppresses retry to avoid a duplicate. Screenshots and receipt/cleanup results remain in the report. This tests delivery to the local capture service, not a real mailbox or spam filtering.

An existing **isolated local form** can use an explicit profile:

```sh
PROJECT=elizabeth-norman npm run release -- forms \
  --profile projects/elizabeth-norman/local-forms.json --run configured-forms-new
```

```json
{
  "version": 1,
  "projectId": "elizabeth-norman",
  "isolated": true,
  "baseUrl": "http://127.0.0.1:8080",
  "requestPath": "/submit",
  "inboxPath": "/inbox",
  "recipient": "local-capture-inbox",
  "stateAttribute": "data-state",
  "successState": "received",
  "failureState": "failed",
  "nativeValidation": true,
  "maxAttachmentBytes": 8192,
  "selectors": {
    "form": "form",
    "name": "#person",
    "email": "#email",
    "company": "#company",
    "message": "#message",
    "marker": "#marker",
    "attachment": "#attachment",
    "submit": "button[type=submit]",
    "feedback": "#feedback"
  }
}
```

Only plain loopback origins are accepted; endpoints are paths without queries/fragments. The page is opened at `/`. Company, attachment and hidden marker selectors are optional; the message always carries the marker. Unsupported upload/native-validation cases are labelled not applicable. The form must expose its confirmation state on the form element and focus feedback on failure. The profile uses the same origin for the form and a capture adapter:

- `GET /inbox?marker=<exact-marker>` returns `{ "messages": [...] }`, with each receipt containing `marker`, `recipient`, `name`, `email`, `company` (empty string when absent), `message`, `receivedAt` and `attachments` (`name`, `bytes`, `sha256`). Receipt data must come from the receiving service, independently of browser confirmation.
- `DELETE /inbox?marker=<exact-marker>` removes only that test marker and returns JSON. A subsequent GET must return no messages for it. The harness never enumerates or bulk-clears an inbox.

The operator must isolate the backend and redirect all outbound delivery to capture before setting `isolated: true`. Browser request blocking cannot isolate server-side email. The configured adapter and its service lifecycle remain the operator's responsibility; no production mail-provider or authentication adapter is included. Configured runs cannot prove preservation of unrelated records through this marker-only API, so report that check as unverified. The configured-profile regression test uses the owned synthetic service, not a client CMS.

### Apply the procedure to a CMS

The platform-neutral order is: identify the exact artifact and intended changes; verify trusted pins; preserve incoming records; take and restore the appropriate backup in isolation; rehearse selective apply and reversal; run marked delivery/recovery checks; then assign owners and evidence to all ten checklist areas. Component success does not approve a launch.

For **WordPress**, separately inventory theme/plugin files, content and option changes. Keep the previous theme and the independent private-upload plugin available. A file journal does not reverse database options, content migrations or plugin state. A production backup must include the database, required files and protected uploads, and be restored into an isolated environment with outbound delivery captured. Preserve submissions, jobs and uploads received since the backup; rolling back a theme must not overwrite the live database. The current kit provides the file rehearsal and checklist, not a WordPress installer or database recovery tool.

For **EmDash**, the London Potters experiment uses Workers, D1 and R2. Record code/static assets separately from bindings, database changes and media. A previous code artifact does not undo D1 migrations or R2 changes. Its existing export helper is a first-import/demo procedure, not a production backup strategy. When a real EmDash release needs this kit, follow that repository's `AGENTS.md` and existing Wrangler configuration and add a proven isolated database/media restore procedure. No EmDash deployment adapter is implemented here.

[Release verification](docs/verification-release-2026-11-12.md) records the two real static-bundle rehearsals, local form tests and remaining production checks. Exit **0** means the requested local operation passed; **2** means a recorded rehearsal/form failure; **1** means setup, input or runner failure. Evidence folders are never overwritten. Release commands do not load the PageSpeed `.env` key.

## Reconcile the historical benchmark

`conditions.json` now includes a SHA-256 digest of the collector files and dependency lockfile. Matching digests prove that runs used the same collector; project URLs, settings and page content still need to be compared separately.

The London Potters reconciliation is an offline replay. It reads the archived 54 Lighthouse audits, runs the current summariser, and checks its medians/ranges against the independent archived summary. URL-matched mobile results retain LCP element names, geometry, image markup, candidate image request sizes, request counts and conditions. It never requests a website or changes the archive:

```sh
node --env-file-if-exists=.env scripts/reconcile-lighthouse.mjs \
  --historical ../london-potters/docs/evidence/2026-11-08/performance-gateway \
  --current projects/london-potters/evidence/2026-11-12-acceptance-standard \
  --output projects/london-potters/evidence/reconciliation-new
```

Choose an unused output folder. The saved JSON records source hashes and passed replay assertions. A changed LCP photograph or image delivery path makes the historical score range a different observation; it cannot establish the effect of a particular repair. The dated verification record owns the reconciliation conclusion.

## Project data and captures

- `projects/<id>/project.json`: version 1 holds paired comparison pages, source URLs, viewports and review wording; version 2 (`kind: "site-check"`) holds one live site, page paths and viewports for checks only.
- `projects/<id>/captures/manifest.json`: immutable-baseline provenance and screenshot metadata.
- `scripts/project.mjs` and `vite.config.js`: select the project, validate its record, and serve or copy only that project's files.
- `src/main.js`: reader interface, note editing/storage and recovery.
- `src/pdf.js`: independent PDF layout, loaded on demand.
- `src/model.js`: project-record validation, portable-note validation and text handling.
- `src/style.css`: responsive web layout, using system fonts. The fonts in `public/fonts/` are only for the PDF.

To prepare captures:

```sh
npx playwright install chromium
npm run capture
npm run capture -- --after-only
```

Existing baseline captures are preserved. `npm run capture -- --replace-baseline` explicitly replaces them; use only when intentionally establishing a new baseline and preserve the previous commit. Capture failures exit nonzero and retain previous successful records. The preparation command runs locally and accepts only URLs from the checked-in project record. It is not a public capture endpoint.

To add a comparison project, create `projects/<id>/project.json` (the folder name and `id` must match), run `PROJECT=<id> npm run capture`, look at the captures, then write notes that describe only what they show. A record needs at least two page pairs; page counts and numbering in the interface and PDF follow the record. The `labels` block is required and names the two versions for that project (for example “Proposed redesign” or “EmDash demonstration”). Keep the client-facing review free of disclaimers about approval or launch status; that context belongs to the conversation with the client. Do not reuse one client's screenshots or branding for another. Imported notes can change copy only, not capture URLs or source identity.

## Verification

```sh
npx playwright install chromium
npm run check
npm audit
```

`check` runs focused model tests (including validation of every project record), builds production output for the selected project, checks all its capture hashes/dimensions, and exercises the built site in Chromium under `/review/` with external requests blocked. It checks navigation, device/view changes, screenshot inspection, edit/reload, note download/import/reset, PDF downloads, missing-image recovery, PDF failure/retry, unavailable storage and initial-load recovery. It also checks overflow at 320, 390, 768 and 1440px, automated accessibility on desktop/mobile and the editor, and basic keyboard navigation.

The browser verification writes desktop/mobile screenshots, notes fixtures and exported PDFs to ignored `output/` (`output/verification/<project>/` and `output/pdf/`). The latest dated verification record is [docs/verification-2026-11-12.md](docs/verification-2026-11-12.md). Inspect rendered PDFs after changes to layout, font metrics or copy limits; successful downloads alone do not establish visual correctness.

## Prototype limits

Capture preparation is a CLI workflow; arbitrary project creation and manual-image upload are not yet in the UI. Notes are local to one browser, not collaborative or automatically included in another person's hosted review; update the project record to publish revised default copy. Exports contain first-screen screenshots, not full-page archives or live interactive websites. PDF screenshot content is raster, while captions and notes are selectable text. PDFs are not tagged accessible documents; the HTML review remains the accessible reading route. Current verification covers Chromium, not every browser or representative user testing.

For PDF content checks after the browser suite, install `pypdf` in your Python environment and run `python3 scripts/verify-pdf.py` (it honours `PROJECT` too). Render the resulting PDFs with Poppler (`pdftoppm -png input.pdf output-prefix`) for the visual review. These optional system tools are not required to run or host the web application.
