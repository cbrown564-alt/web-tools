# Release kit verification — 12 November 2026

This record describes phase 5's local manual prototype. [PRODUCT.md](../PRODUCT.md) owns intended behaviour; [README.md](../README.md) owns commands, profiles and platform operating notes; [plan.md](plan.md) owns phase status.

## Two real static bundles

The same collector ran package, archive/folder verification, backup restore, application, reversal and local form tests for Elizabeth Norman and London Potters. All six evidence runs record collector SHA-256 `3567e2b23628da10313db04db98b6257f0192405864e8bb47bfc12d4d9a3a90f`, without source changes between the two projects.

The candidates are the real phase-4 `2026-11-12-content-review-ready` **static review bundles**. Baselines are each project's `2026-11-12-content-acceptance` folder. These are Web Tools review artifacts, not either client's WordPress theme or EmDash website. Editorial decisions remain undecided and London Potters' partial inventory remains visible.

| Project                        | Packaged files | Restored baseline files | Changed / unchanged operations | Local form cases |
| ------------------------------ | -------------: | ----------------------: | -----------------------------: | ---------------: |
| Elizabeth Norman International |             16 |                      17 |                         2 / 14 |            18/18 |
| London Potters                 |             25 |                      26 |                         2 / 23 |            18/18 |

Every rehearsal restored its backup into a fresh directory before application. The two changed files were `index.html` and `manifest.json`; captures were unchanged. The unselected baseline `conditions.json` survived. Both reversals restored the original contents and modes and preserved a synthetic incoming file created after application. Browser checks opened both `restore/index.html` and the reversed `target/index.html`, loaded real local captures and 50-page navigation, with external requests blocked and no uncaught errors. No client CMS or original evidence directory was changed.

Final immutable run names, under each project's `evidence/`:

- `2026-11-12-release-package-checked`: fixed manifest, payload, transport archive, pins and report.
- `2026-11-12-release-rehearsal-checked`: owned disposable target, sealed backup and restored copy, apply journal, uniquely named reversal evidence and report.
- `2026-11-12-release-forms-checked`: 18 browser captures, receipt/attachment/cleanup results and report.

Each run also has conditions and a ten-area pending launch checklist. Earlier runs are preserved as development history; the checked runs above are the completion evidence.

## Form receipt and recovery

Both real project records ran against the owned synthetic loopback form, not their live client forms. Each passed nine cases on desktop and mobile: successful delivery, no attachment, native validation, network loss, server 503, malformed response, a delivered message with lost confirmation, oversized upload and disallowed extension.

All 36 cases matched the capture recipient and synthetic fields, checked attachment identity when present, and verified marker-scoped deletion. Unrelated fixture records survived. Undelivered failures kept the message, focused the error and recovered through manual retry. Lost confirmations found the existing receipt and suppressed retry. Synthetic DOCX bytes contain the marker and have a readable ZIP/XML structure. The form's encoding was corrected after visual inspection, before these final checked runs.

The configurable profile was separately exercised against a caller-owned instance of the same local fixture. Wrong project, non-isolated and external-origin profiles were rejected. A deliberately wrong receipt recipient failed every case while still cleaning up its marked messages. The configured marker-only API cannot inspect unrelated records, so its report leaves preservation unverified; the test independently checked that the fixture's unrelated record survived.

No staff email, real applicant data, production form, CRM record, protected upload or client database was used. Local capture receipt does not establish SMTP delivery, spam filtering or a real staff mailbox's behaviour.

## Checks and report review

- Eight release tests cover payload/manifest tampering, extra files, unsafe paths, secrets and symlinks; file modes and exact backup restoration; write/create/delete reversal; all-file conflict preflight; preservation of new files; idempotent reversal; recoverable injected interruption; journal-blob tampering; transported archive verification; and CLI evidence preservation.
- The repository's 40-test suite, production build and comparison browser checks passed with `npm run check` and `PROJECT=london-potters npm run check`. These include the existing comparison, watch, inventory and content workflows.
- All six release reports were opened offline at 1,440px and 390px: zero axe WCAG 2/2.1 A/AA violations, no page-level horizontal overflow or uncaught errors, and all local evidence links resolved. Wide tables scroll within labelled keyboard-focusable regions. Results, screenshots and print PDFs are under ignored `output/verification/release/`.
- Browser screenshots were visually inspected, including local success/lost-confirmation forms and restored client review artifacts. Print output was inspected as an ordinary browser print rendition; it is not a tagged accessible document.
- The local PageSpeed key was checked for absence from release source and generated package/report evidence without printing it. `.env` and generated evidence remain ignored. `git diff --check` passed.

## Pins

Retain these independently if transferring the artifacts. Verify the archive hash before extraction, then the extracted package's manifest/payload hashes before use. These pins establish byte identity, not launch approval.

### Elizabeth Norman International

- Manifest: `d70f15df9f719c9972c80882d0dc0a8eb66ffec386856a5a784b7379ff2219d5`
- Archive: `2e20cdedc572bab8179dffed550255eacac8e883d3af335a859409693056a6a6`
- Backup manifest: `a9685ec7067a1d002b0f70f862040ee96eb25b2347d4a254179838ee7a87a1ae`
- Apply journal: `505239c898ec6b3917e506c2814ed7fc59500f8c9bce20d0a279f19db4280bc7`

### London Potters

- Manifest: `65152a76380fbba9459a0a2ed9ea514687fdce5f6b7f22ae1a76230720dd9db9`
- Archive: `522963b576c0cc7b39695b8bbd7f2f690a6c00c2c801718b829ae0c5ad7605d4`
- Backup manifest: `d63070af819ab922cd65e6452b757ff19bc992edc25a25af786355b4ed555f7e`
- Apply journal: `471179d78ec3df0da62a0ea2e1336ea06554b49843e7cb2e79e58006f07e33df`

## Remaining production work

All ten launch areas remain pending named owner review. This file-only rehearsal does not prove database/media recovery, permissions beyond regular-file modes, server recovery, power-loss durability, real email delivery, cross-browser support or representative user acceptance. The interruption test injects a failure after a write; it is not a process-kill or power-loss test. Source and payload checks assume an isolated local rehearsal, not a hostile concurrently modified filesystem.

WordPress operating notes cover old-theme availability, independent private uploads, separate content/options changes and preservation of incoming submissions/jobs/uploads. EmDash notes distinguish Workers artifacts from D1/R2 state and explicitly exclude its first-import export helper as a production backup. Neither platform has a production deployment or database-restore adapter here. Add those only against a real job's isolated restore and delivery environment.
