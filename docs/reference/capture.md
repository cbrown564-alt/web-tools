# wt capture and the comparison app

```
wt capture <project> [options]
```

Capture first-screen pairs for the before and after comparison.

| Option               | Meaning                          |
| -------------------- | -------------------------------- |
| `--after-only`       | Capture only the after site      |
| `--replace-baseline` | Replace existing before captures |

Status: the before-and-after tool is the first full working prototype: a hosted review and a side-by-side PDF. It runs from two project records: Research Network (a proposed redesign) and London Potters (an EmDash demonstration that keeps the existing design). Neither is client-approved or launched; inclusion here does not imply either. The comparison tool itself is static and does not require a CMS. Publishing a client-facing site is a separate action.

## Prepare captures

```sh
npx playwright install chromium
wt capture research-network
wt capture research-network --after-only
```

Existing baseline captures are preserved. `wt capture <project> --replace-baseline` explicitly replaces them; use only when intentionally establishing a new baseline and preserve the previous commit. Capture failures exit nonzero and retain previous successful records. The preparation command runs locally and accepts only URLs from the checked-in project record. It is not a public capture endpoint. It sends no cookies or credentials to the sources.

Captures are written to `projects/<id>/captures/`, with provenance and screenshot metadata in `projects/<id>/captures/manifest.json`. Each capture is the first viewport, with no content removed. `wt capture` needs a paired (version 1) record; it does not create a run under `evidence/` and takes no `--run`.

## Add a comparison project

Create `projects/<id>/project.json` (the folder name and `id` must match), run `wt capture <id>`, look at the captures, then write notes that describe only what they show. A record needs at least two page pairs; page counts and numbering in the interface and PDF follow the record. The `labels` block is required and names the two versions for that project (for example “Proposed redesign” or “EmDash demonstration”). Keep the client-facing review free of disclaimers about approval or launch status; that context belongs to the conversation with the client. Do not reuse one client's screenshots or branding for another. Imported notes can change copy only, not capture URLs or source identity. [project.md](project.md#project-record) shows the record format.

`wt new` creates a live-site (version 2) record, which works with the checks but not with the comparison app.

## Run the comparison

The app commands are npm scripts, not `wt` tools. They work on one paired project, chosen with the `PROJECT` environment variable; the default is `research-network`.

```sh
npm ci
npm run dev
PROJECT=london-potters npm run dev
```

Open the printed local URL, normally `http://127.0.0.1:4173`. Choose a page, switch desktop/mobile or toggle views, and enlarge either screenshot to inspect it. The complete capture fits the available screen automatically; choose **Original size** only when you want to scroll through pixel-level detail. **Edit notes** changes that page's headline, introduction and before/after explanations. Notes persist in browser storage; **Project notes** downloads/imports a JSON backup and offers an explicit reset.

**Export PDF** downloads every page pair for the selected device, with current notes, source links and capture dates. It generates the PDF in the browser; no notes or screenshots are sent to a rendering service. The PDF uses A3 landscape, one pair per page. At A4 print size, screenshot text will be smaller; use A3 or inspect digitally for detail.

## Build and host

```sh
npm run build
npm run preview
PROJECT=london-potters npm run build
```

Upload the contents of `dist/` to any static host. A build contains exactly one project, so one client's review never ships another client's captures. The build works at a domain root or beneath a path such as `/review/`. It includes screenshots and fonts locally; neither source website is needed for review or export. Serve it over HTTP(S), not by opening `index.html` as a `file://` URL. There are no server secrets, runtime database or CMS requirements.

`npm run package` builds `output/<project>-review-static.tar.gz` using the system `tar` command. Extract it into the hosting directory. This command does not publish anything. There is currently no configured public deployment.

The prototype carries `noindex, nofollow`; this discourages indexing but is not access control. Choose the intended audience in the host's own settings when publishing.

## Source files

- `projects/<id>/project.json`: version 1 holds paired comparison pages, source URLs, viewports and review wording.
- `projects/<id>/captures/manifest.json`: immutable-baseline provenance and screenshot metadata.
- `scripts/project.mjs` and `vite.config.js`: select the project, validate its record, and serve or copy only that project's files.
- `src/main.js`: reader interface, note editing/storage and recovery.
- `src/pdf.js`: independent PDF layout, loaded on demand.
- `src/model.js`: project-record validation, portable-note validation and text handling.
- `src/style.css`: responsive web layout, using system fonts. The fonts in `public/fonts/` are only for the PDF.

## Verification

```sh
npx playwright install chromium
npm run check
npm audit
```

`check` runs focused model tests (including validation of every project record), builds production output for the selected project, checks all its capture hashes/dimensions, and exercises the built site in Chromium under `/review/` with external requests blocked. It checks navigation, device/view changes, screenshot inspection, edit/reload, note download/import/reset, PDF downloads, missing-image recovery, PDF failure/retry, unavailable storage and initial-load recovery. It also checks overflow at 320, 390, 768 and 1440px, automated accessibility on desktop/mobile and the editor, and basic keyboard navigation.

The browser verification writes desktop/mobile screenshots, notes fixtures and exported PDFs to ignored `output/` (`output/verification/<project>/` and `output/pdf/`). The latest dated verification record is [verification-2026-11-12.md](../verification-2026-11-12.md). Inspect rendered PDFs after changes to layout, font metrics or copy limits; successful downloads alone do not establish visual correctness.

For PDF content checks after the browser suite, install `pypdf` in your Python environment and run `python3 scripts/verify-pdf.py` (it honours `PROJECT` too). Render the resulting PDFs with Poppler (`pdftoppm -png input.pdf output-prefix`) for the visual review. These optional system tools are not required to run or host the web application.

## Prototype limits

Capture preparation is a CLI workflow; arbitrary project creation and manual-image upload are not yet in the UI. Notes are local to one browser, not collaborative or automatically included in another person's hosted review; update the project record to publish revised default copy. Exports contain first-screen screenshots, not full-page archives or live interactive websites. PDF screenshot content is raster, while captions and notes are selectable text. PDFs are not tagged accessible documents; the HTML review remains the accessible reading route. Current verification covers Chromium, not every browser or representative user testing.
