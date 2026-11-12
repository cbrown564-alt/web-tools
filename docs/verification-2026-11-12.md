# Comparison prototype verification — 12 November 2026

## Result

Implemented and verified locally with Research Network as the first project. This is a working prototype, not client validation or a public deployment. The existing Research Network site and its EmDash preview were read for captures; neither was modified.

## Checks passed

- `npm run check`: focused portable-note validation tests, production build and the Chromium browser suite.
- All 16 real capture PNGs match their recorded SHA-256 and viewport dimensions: four pages, two devices, two versions.
- Built site served under `/review/`, with all external requests blocked. Page navigation, device selection, side-by-side/toggle views and screenshots work from local assets.
- Edit → save → reload → PDF; the exported PDF contains the edited note. Notes download, import, invalid/foreign-file rejection, reset cancellation and confirmed reset all passed.
- Missing-image retry, PDF failure/retry, unavailable browser storage with downloadable recovery, and initial-load retry passed. No uncaught browser errors.
- No page overflow at widths 320, 390, 768 and 1440, for both capture devices.
- Screenshot inspector fits the complete capture at 1543 × 983, 1440 × 900, 390 × 844 and 320 × 568. Original-size viewing is a separate control. Escape closes the dialog; keyboard activation of the notes editor and skip link passed.
- Axe WCAG 2 A/AA and 2.1 AA scans found no violations on the desktop review, mobile review or notes editor. This is automated coverage, not a WCAG certification or screen-reader user study.
- `npm audit`: zero known vulnerabilities in the installed dependency tree.
- `git diff --check`: passed.

## Visual and PDF review

Inspected the desktop review, 390px mobile review, desktop-capture layout on mobile, and fitted inspector. Fixed the initial inspector's oversized image/scrolling behaviour after user feedback; it now fits by default. Also fixed missing spacing in the mobile closing heading and made status notices temporary so they do not persist over the comparison.

Exported both desktop and mobile PDFs through the browser UI. Rendered and inspected all eight pages using Poppler. The paired screenshots, captions, notes, source links and page numbers are present with no observed clipping or overlap. PDFs contain four A3 landscape pages each. `scripts/verify-pdf.py` checks page dimensions, extracted original/edited copy, paired image counts and source-link annotations. The prepared output uses the original project notes, not test edits.

Generated evidence lives in ignored `output/verification/` and `output/pdf/`; rerun the documented commands to regenerate it. The source captures and their manifest are tracked.

## Limits

Chromium only; Safari, Firefox, assistive-technology user testing and representative client validation have not been performed. PDF screenshots are raster and the PDF is not tagged; the HTML review is the accessible reading route. The comparison covers first viewports, not complete page scrolls or live interactions inside the source websites. No public host has been provisioned. Local browser notes do not automatically become shared defaults; change the project record before publishing updated default copy.

## Second project — later on 12 November 2026

The tool was generalised to per-project records in `projects/` and London Potters was added: five page pairs, 20 real captures of the public website and the public EmDash demonstration. Neither site was modified.

- `npm run check` and `PROJECT=london-potters npm run check` both pass the same suite described above, each against a build containing only that project.
- Inspected the London Potters desktop review page, desktop PDF page 2 and mobile PDF page 3 as rendered images: labels, five-page numbering and notes are correct with no clipping or overlap.
- Not done: `scripts/verify-pdf.py` was not run in this pass (pypdf not installed); only the top of the Research Network review page and page 1 of its desktop PDF were re-inspected after the refactor; the full London Potters PDFs were sampled, not read page by page. London Potters notes were written from the captures and have not been reviewed by the client.
- Status and approval disclaimers were then removed from the review page and PDF at the owner's request; both check suites were rerun and pass.
- The review page was then stripped back to a single toolbar and the comparison. Both check suites were rerun and pass, including overflow at 320–1440px and the automated accessibility scans. Inspected London Potters at 1440px and 390px (both capture devices) and the enlarged-screenshot view. The PDF layout was not changed at that point.
- The PDF was then simplified to match (white page, plain header, screenshots, source line, notes). Both check suites pass, and `scripts/verify-pdf.py` (pypdf in a temporary virtualenv) passes for both projects on desktop and mobile PDFs. Inspected Research Network desktop page 1 and London Potters mobile page 4 as rendered images; other pages were not viewed.
