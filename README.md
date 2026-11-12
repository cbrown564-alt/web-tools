# Web Tools

Reusable tools for preparing, reviewing, delivering and launching bespoke websites. The working approach comes from the Elizabeth Norman International, Research Network and London Potters projects.

## Direction

Use one project record to produce consistent client material: website comparisons, content decisions, migration evidence, handover instructions and launch media. EmDash is the default for new website implementations; each client's identity and content model remain bespoke. The comparison tool itself is static and does not require a CMS.

## Document owners

- [PRODUCT.md](PRODUCT.md) owns intended behaviour, scope, priorities and prototype acceptance criteria.
- [docs/plan.md](docs/plan.md) owns what is built next, in what order, and what done means for each tool.
- This README owns repository navigation, setup, commands and operational instructions.
- Source code and tests own implementation facts. Capture manifests own image provenance. Dated verification records describe checks, not client acceptance.

## Planned tools

1. Before-and-after comparison: hosted review and side-by-side PDF. Working on two projects.
2. Site check: performance, cache, accessibility, security and discovery checks at minimal, standard and maximum depth.
3. Post-launch watch: screenshot baselines and assertions that catch regressions after release.
4. Page inventory and discovery kit: crawl, captures and a technical probe.
5. Content decisions and redirects: keep, rewrite, consolidate or remove, through to a checked redirect map.
6. Release kit and form tests: verified packages, reversible changes, restore rehearsal and inbox tests.

The EmDash starter and promo studio are parked. [docs/plan.md](docs/plan.md) has the detail, order and acceptance for each.

Build one complete loop, prove it on a second project, then extract the shared pattern. Do not create a general platform ahead of that evidence.

## Current work

The before-and-after tool is the first full working prototype. It now runs from two project records: Research Network (a proposed redesign) and London Potters (an EmDash demonstration that keeps the existing design). Neither is client-approved or launched; inclusion here does not imply either.

The prototype is implemented in this repository with a static build suitable for ordinary web hosting. Publishing a client-facing site is a separate action. Setup and verification commands follow below.

## Run the comparison

Requires Node.js 22.12+ (verified with Node.js 24) and npm.

```sh
npm ci
npm run dev
```

Open the printed local URL, normally `http://127.0.0.1:4173`. Every command works on one project, chosen with the `PROJECT` environment variable; the default is `research-network`. For example, `PROJECT=london-potters npm run dev`. Choose a page, switch desktop/mobile or toggle views, and enlarge either screenshot to inspect it. The complete capture fits the available screen automatically; choose **Original size** only when you want to scroll through pixel-level detail. **Edit notes** changes that page's headline, introduction and before/after explanations. Notes persist in browser storage; **Project notes** downloads/imports a JSON backup and offers an explicit reset.

**Export PDF** downloads every page pair for the selected device, with current notes, source links and capture dates. It generates the PDF in the browser; no notes or screenshots are sent to a rendering service. The PDF uses A3 landscape, one pair per page. At A4 print size, screenshot text will be smaller; use A3 or inspect digitally for detail.

## Build and host

```sh
npm run build
npm run preview
```

Upload the contents of `dist/` to any static host. A build contains exactly one project (`PROJECT=london-potters npm run build`), so one client's review never ships another client's captures. The build works at a domain root or beneath a path such as `/review/`. It includes screenshots and fonts locally; neither source website is needed for review or export. Serve it over HTTP(S), not by opening `index.html` as a `file://` URL. There are no server secrets, runtime database or CMS requirements.

`npm run package` builds `output/<project>-review-static.tar.gz` using the system `tar` command. Extract it into the hosting directory. This command does not publish anything. There is currently no configured public deployment.

The prototype carries `noindex, nofollow`; this discourages indexing but is not access control. Choose the intended audience in the host's own settings when publishing.

## Project data and captures

- `projects/<id>/project.json`: project identity, page pairs, base URLs, viewport sizes, original review copy and all project-specific wording (`labels`).
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

To add a project, create `projects/<id>/project.json` (the folder name and `id` must match), run `PROJECT=<id> npm run capture`, look at the captures, then write notes that describe only what they show. A record needs at least two page pairs; page counts and numbering in the interface and PDF follow the record. The `labels` block is required and names the two versions for that project (for example “Proposed redesign” or “EmDash demonstration”). Keep the client-facing review free of disclaimers about approval or launch status; that context belongs to the conversation with the client. Do not reuse one client's screenshots or branding for another. Imported notes can change copy only, not capture URLs or source identity.

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
