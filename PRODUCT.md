# Web Tools product

## Purpose

Make the repeatable parts of bespoke website work faster and clearer, while preserving the judgement that makes each website distinctive. Clients should understand what changed, why it helps and what still needs a decision.

## First prototype: Before & After

Build a complete comparison-to-PDF loop using Research Network's existing public website and its EmDash preview. Use real captures with source URLs, capture dates and matched viewports. Clearly distinguish the current website from the proposed redesign.

### Reader experience

A plain, functional tool: one toolbar, then the two screenshots as large as the screen allows, then short explanations. No hero, decorative type or spacing for its own sake; it should be tidy, not elegant. Readers can choose a page, compare desktop or mobile captures, view both versions together or switch between them, and inspect screenshots at a readable size. The enlarged view must fit the complete capture to the available screen by default; original-size scrolling is an explicit zoom option. Mobile gets a considered layout rather than compressed desktop columns.

The comparison describes specific visible improvements. It carries no disclaimers about approval, launch or status; it simply must not invent client approval, conversion gains, performance measurements or missing content. Capture failures must be identified as failures, never presented as an empty source website.

### Preparation and export

A project record contains project identity, introductory copy, paired page URLs, screenshot provenance and editable explanations. Preparers can amend notes, retain changes across visits, reset intentionally, and export/import their project notes. Storage failures must leave the current work usable and offer a download recovery route.

The PDF is a dedicated landscape layout with readable side-by-side screenshots, before/after labels, explanations, provenance and page numbers. It uses the currently selected device and saved/current notes. Export errors retain edits and allow retry. The website must be buildable as static files without a runtime server or live source-site dependency.

Capture is a local preparation command in this prototype, not an unauthenticated public URL-fetching service. Keep the original baseline immutable by default. Refresh proposed captures explicitly; replacing the baseline requires an explicit command. Manual captures can be supplied in the project record when a site cannot be captured reliably.

### Bounded scope

Include four representative page pairs and desktop/mobile views, screenshot inspection, local note editing, portable notes and client-side PDF generation. Do not build accounts, collaboration, arbitrary project creation, live iframe comparison, CMS administration or a video editor in this first slice.

A downloadable HTML review may be added if it makes sharing materially easier. The minimum hosting deliverable is a self-contained static build with local assets and relative URLs.

### Acceptance

- Real Research Network before/after captures have verified source URLs and matching device dimensions.
- A reader completes page selection, device change, comparison and image inspection on desktop and mobile, including keyboard use.
- A preparer changes text, reloads, recovers it and exports a PDF containing those changes.
- Missing captures, invalid imports, unavailable storage and PDF failures have understandable recovery paths.
- PDF pages are rendered and visually inspected; text, page count and dimensions are checked.
- The production build runs without the original source websites or development server.
- Required checks pass and limitations are recorded before completion is claimed.

## Site check

A local command reads the selected project record and checks the sites listed in that record. Paired projects compare before and after; a live-site record checks the current site once. Minimal answers whether anything is obviously wrong; standard compares the versions with repeated performance measurements and broader checks. Modules can run independently. The command saves machine-readable evidence and conditions, then renders a plain HTML report that can be rebuilt offline and printed.

Unavailable pages, blocked requests and incomplete checks must remain visible. A successful collection must not imply that a site passed every check. Cache state comes from observed headers; unique query strings are probes, not proof that a cache was bypassed. Automated accessibility and keyboard probes must identify the parts that need human review. Credentials remain local and must never appear in reports, evidence or static comparison builds.

[docs/plan.md](docs/plan.md) owns the module definitions and phase acceptance criteria. [README.md](README.md) owns commands, configuration and operating limits.

### Maximum investigation

Maximum answers why a public journey is slow and whether an experiment supports a proposed explanation. An explicit project profile defines bounded full discovery, timed recorded-page journeys, exact resource ablations or recorded-deployment comparisons, repetitions, expected elements and parity coverage. It reuses inventory crawling and cache headers, rather than sampling a few sitemap URLs. Every source failure, exclusion and limit remains visible.

Baseline/candidate order alternates in fresh browser contexts. Samples retain Chrome performance traces, actual timestamped filmstrips, network observations and step captures. The report compares selected element identity/counts/geometry, document height and viewport pixels. Its numbered findings separate directly confirmed observations, strongly supported repeatable ablation effects and unresolved causes. Missing interventions, inconsistent gains, partial journeys or parity failures prevent a strong causal finding. Deployment differences remain confounded; resource suppression is a diagnostic intervention, not an automatically deployable fix.

The bounded implementation covers anonymous read-only navigation, Chromium desktop/mobile viewports and unthrottled local measurements. Initial journey failures prevent repeated experiments; rate limiting/server stops retain partial reports. Credentials and cookie headers are excluded from structured evidence. Public captures and traces remain internal evidence to review before sharing. It does not submit forms, edit production code, measure real-user INP, establish full functional equivalence or approve an optimisation for production. Minimal/standard checks remain separate commands.

## Post-launch watch

A local command captures the selected site's recorded pages in full, checks project assertions and runs the minimal site check. The reviewer sees changed captures side by side, failed assertions and new or resolved site-check findings. A first run requests a baseline; an explicit accept command makes a reviewed run the next baseline. Old evidence remains immutable. A quiet run reports no changes and keeps the captures available for inspection.

Assertions cover required script presence, visible elements, expected listing items, computed styles and exact attributes. Capture scrolls to load lazy images, waits for visible assets and records URL, time, viewport and image hash. It must report capture limits and load failures rather than accept incomplete images. Failed assertions, incomplete checks, changed settings and stale comparisons prevent acceptance. Masks must be explicit and recorded. A baseline records an observed state, including existing site-check findings; it is not a declaration of health.

This phase provides the complete manual capture, review, accept and repeat loop with portable offline reports. Scheduling, notifications, authenticated pages, form submissions and verification of script delivery are outside this prototype. The saved ENI replay must identify the missing survey loader, lost gallery CSS and absent recent article, and return to quiet after recovery. The same collector must run on two real project records.

## Page inventory and discovery kit

A local command builds one inspectable inventory per selected site from sitemaps, explicit seeds and ordinary HTML links to a configured depth. Every observed URL retains its HTTP result, redirect chain, title, canonical, decoded document size and template grouping with the basis for that grouping. A technical summary records platform markers, public plugin/theme asset versions, forms and trackers, without claiming unobserved versions or active delivery.

A preparer can capture all successful HTML pages at the project devices, explicitly select representative coverage, or collect HTTP observations without screenshots. The report states that scope, offers page search and evidence links, and remains usable offline. Failures, crawl limits, exclusions and pending work must remain visible. Historical inventories provide seeds and exact URL reconciliation, with dated counts distinguished from current observations. Later tools consume the generated inventory through a per-site project pointer; old evidence is preserved. Competitor sites configured in the project can use the same collector and a side-by-side sheet with their own sources and capture selections.

The bounded prototype covers anonymous public pages and does not submit forms, enumerate candidate/user data, or infer hidden technology versions. It must run on London Potters and Elizabeth Norman with historical count differences explained. Source websites and their content remain unchanged.

## Content decisions and redirects

A static review page uses a finished inventory snapshot, with page search, decision filters, device captures, image inspection, a per-URL disposition and notes. Existing source and capture failures remain visible. Every row starts undecided. Editorial choices are made by the reviewer, not generated from status codes or historical recommendations.

Keep/rewrite retain the URL. Consolidate names an exact destination and permanent redirect status. Remove chooses 404 or 410. Decisions persist in browser storage and can be backed up as JSON or exchanged through CSV spreadsheets. Imports match project and inventory identity, preserve current data on failure, and expose missing/invalid fields. Storage failure keeps edits downloadable; conflicting tabs offer download and reload recovery.

The decision set compiles to a redirect map with explicit decided/undecided and source-inventory coverage. Invalid destinations and contradictory rules block export. A read-only CLI checks every exported rule against the intended source or a supplied test origin, recording exact initial status, redirect hops, destination and failure. Partial coverage must remain explicit. The checker neither installs rules nor proves that rewritten content is correct.

This prototype stays static with local edits and spreadsheet/JSON exchange. Shared database persistence, authenticated journeys, deployment adapters, wildcard routes and content generation are outside this phase. The complete review/import/export/check loop must pass with injected URL failures and browser recovery paths, and the same preparer must produce working reviews from two real project inventories. Client editorial decisions and source-site changes require their own work; preparing the tool does not imply them.

## Release kit and form tests

A local command creates an explicit static-file package with hashes and modes, verifies it against a pinned manifest, and rehearses selective application in a marked disposable target. A regular-file backup must restore into a fresh copy before application. Changed files retain their originals and before/after journal; reversal refuses unexpected drift and preserves unrelated incoming files. Package, backup and journal identities remain inspectable in immutable evidence with a plain offline report. Transport archive verification precedes extraction; extracted payload verification precedes application.

A synthetic local form and independent capture inbox exercise successful receipt, optional fields and DOCX uploads, validation, network/server/malformed-response failures, lost confirmation and upload rejection on desktop and mobile. Failed submissions preserve input and permit manual recovery. The harness checks for receipt before retrying after lost confirmation, then cleans up only its marked records. An explicit profile can connect an isolated loopback form to the same marker-scoped capture API. Results distinguish owned fixtures, configured forms, unsupported cases and unverified preservation checks.

Each run includes a ten-area launch checklist with owner/evidence fields, initially pending. Filesystem restore and local capture delivery do not approve an entire launch. WordPress and EmDash require their own database, media, integration and real delivery checks before production use; their operating notes belong in README. The current proof uses two real content-review bundles and synthetic local forms. It does not deploy either client's CMS, restore production databases or establish arrival in a staff mailbox.

## Future work

[docs/plan.md](docs/plan.md) owns the sequence of tools to build next, what each is for and what done means. The planned core tools now have bounded local prototypes. Extend them against a concrete job and keep production promotion separate. The EmDash starter and promo studio are parked there.

## Decisions

- 12 November 2026: begin with a static comparison tool, because the client review and PDF should remain usable independently of either source website or CMS.
- 12 November 2026: Research Network is the first representative project; expand only after the complete review/export loop works.
- 12 November 2026: EmDash is the default for future website projects, while the toolset's presentation assets stay portable.
- 12 November 2026: London Potters is the second project. It preserves the existing design, so project-specific wording (what each version is called) lives in the project record, not the code. One project per build.
- 12 November 2026: removed status and approval disclaimers from the review page and PDF. They cluttered client-facing material to state what the client relationship already makes plain. Accuracy is kept by not making false claims, not by adding caveats.
- 12 November 2026: stripped the review page back to a toolbar and the comparison. The comparison is the focus; the page is a functional tool, not an editorial piece. The PDF follows the same rule: white page, one line of header, the two screenshots, source and notes.
- 12 November 2026: the forward plan moved to docs/plan.md, drawn from the London Potters performance work and the Elizabeth Norman project.
