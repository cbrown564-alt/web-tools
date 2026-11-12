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

## Future work

### EmDash starter

Standardise setup and hosting configuration, previews, schema changes, media ownership, editor permissions, the draft/publish/correct loop, backups and restoration. Version maintained patches and fail visibly when an upgrade is incompatible. Keep production accounts and operational ownership explicit. The default is our implementation preference, not evidence of a client's platform acceptance.

### Content and migration tools

Reuse page inventories and screenshots for keep/rewrite/merge/archive decisions. Preserve source identity, record redirects, reconcile media and make reruns safe. A migration rehearsal must demonstrate recovery before production promotion.

### Launch and handover

Collect checks for real visitor journeys, form delivery, mobile and keyboard access, metadata, performance, backups and editor tasks. Distinguish measured results from targets and developer checks from user validation. Generate a concise handover with named owners.

### Promo studio

Start with a guided story: before/after, three improvements or one visitor journey. Reuse approved screenshots, recordings, brand assets and copy. Offer a small set of carefully designed motion templates with editable pacing/captions, landscape and portrait output, and matching stills. Generated or provisional material remains labelled.

## Decisions

- 12 November 2026: begin with a static comparison tool, because the client review and PDF should remain usable independently of either source website or CMS.
- 12 November 2026: Research Network is the first representative project; expand only after the complete review/export loop works.
- 12 November 2026: EmDash is the default for future website projects, while the toolset's presentation assets stay portable.
- 12 November 2026: London Potters is the second project. It preserves the existing design, so project-specific wording (what each version is called) lives in the project record, not the code. One project per build.
- 12 November 2026: removed status and approval disclaimers from the review page and PDF. They cluttered client-facing material to state what the client relationship already makes plain. Accuracy is kept by not making false claims, not by adding caveats.
- 12 November 2026: stripped the review page back to a toolbar and the comparison. The comparison is the focus; the page is a functional tool, not an editorial piece. The PDF layout is unchanged.
