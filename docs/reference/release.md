# wt release

```
wt release <project> [action] [options]
```

Package, verify and rehearse a release; test forms locally.

| Action     | Meaning                                            |
| ---------- | -------------------------------------------------- |
| `pack`     | Package the files named in release.json (default)  |
| `verify`   | Check a package or archive against its pin         |
| `rehearse` | Apply and reverse the package in a disposable copy |
| `reverse`  | Reverse a rehearsal again from its journal         |
| `forms`    | Run marked form deliveries against a local inbox   |

| Option                     | Meaning                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--spec <file>`            | Release specification. Default: the project's own                                                            |
| `--package <folder>`       | Package folder. Default: the latest package run                                                              |
| `--archive <file>`         | Package archive to verify before extracting                                                                  |
| `--sha <sha256>`           | Trusted pin. Default: the pin recorded by that run                                                           |
| `--baseline <run\|folder>` | Files the release is applied over                                                                            |
| `--journal <folder>`       | Rehearsal journal. Default: the latest rehearsal                                                             |
| `--target <folder>`        | Rehearsal target. Default: the latest rehearsal                                                              |
| `--profile <file>`         | JSON profile that configures this run                                                                        |
| `--run <name>`             | Name the run this command creates, or choose the run it acts on. Default: the next number, or the latest run |

Status: fixed-file packages, backup restore, selective reversal and local capture-inbox tests, working as a local manual prototype on two static review bundles.

This is a local rehearsal tool. Elizabeth Norman’s supplied `release.json` packages its phase-4 **static content-review bundle**. London Potters’ current specification packages the local **Worker modules and static assets** staged by its complete workflow run. The latter is a pinned code/assets artifact, not a Workers deployment adapter or database/media backup. Earlier phase-5 review-bundle runs remain historical evidence.

Each `pack`, `rehearse`, `reverse` and `forms` run gets an unused `projects/<id>/evidence/<run>/` folder, named `<date>-release-<action>-NN` unless `--run` names it, with a portable HTML report, JSON results, conditions/source hashes and a ten-area launch checklist. All checklist areas start pending, with an owner and evidence still to supply. The report opens with what was checked, what was found and what needs a decision. Evidence folders are never overwritten. Release commands do not load the PageSpeed `.env` key.

## Release specification

`projects/<id>/release.json` names a candidate directory within that project and an explicit file list:

```json
{
  "version": 1,
  "projectId": "elizabeth-norman",
  "platform": "static-files",
  "source": "evidence/2026-11-12-content-review-ready",
  "baseline": "evidence/2026-11-12-content-acceptance",
  "files": ["index.html", "manifest.json", "captures/example.png"],
  "delete": []
}
```

Use the actual supplied specifications for the current bundles; the short example above only illustrates the schema. `baseline` is optional: it names the folder, relative to the project, that a rehearsal applies the release over when `--baseline` is not given. There are no globs. Deletions must also be explicit. The packer rejects traversal, symlinks, special files, case collisions and sensitive paths including `.env*`, `.git`, `wp-config.php`, SQL dumps and private keys. Only distribute deliberately selected public files. `--spec <file>` packs from another specification; its project ID must match.

## Package, verify and rehearse

```sh
wt release elizabeth-norman pack
wt release elizabeth-norman verify
wt release elizabeth-norman rehearse --baseline 2026-11-12-content-acceptance
```

`verify` and `rehearse` use the latest package run: its `package/` folder and the manifest pin that run recorded. The command prints which run and pin it used. `--baseline` takes a run name or a folder inside the project; leave it out when `release.json` has a `baseline` field. Without either, rehearsal stops and says so.

To check a transported copy, pass the trusted pins yourself. A package folder you name with `--package` always needs `--sha`, and an archive always needs its own pin:

```sh
wt release elizabeth-norman verify \
  --archive /path/to/package.tar.gz \
  --sha <trusted-archive-sha256>
wt release elizabeth-norman verify \
  --package /path/to/extracted/package \
  --sha <trusted-manifest-sha256>
```

A pack run writes `package.tar.gz` and `package/` in its evidence folder. The package report and `results.json` record two different pins: the archive SHA-256 identifies the compressed transport bytes; the manifest SHA-256 identifies the operations and their payload hashes/modes. Retain trusted pins separately from transferred bytes. Verify the archive before extracting a transported copy into a new empty directory, then verify its extracted `package/` folder. Archive verification never extracts files. Folder verification rejects missing, changed and unexpected payload files. A hash establishes identity relative to its trusted pin; it does not approve the contents or authenticate a sender. The defaults read the pin from the same disk as the package, so they confirm the local package is intact; they are not a check of a copy received from elsewhere.

Rehearsal first copies the baseline into a fresh, explicitly marked local target. It snapshots regular-file contents and modes, restores that snapshot into another fresh directory, and verifies that restore **before** applying the package. Every changed file gets a before/after journal and a saved original; unchanged files are skipped. The runner then creates a synthetic incoming record, reverses the selected changes, and verifies both original files and preservation of the incoming record. It leaves `target/`, `restore/`, `backup/` and `journal/` available for inspection. No original source directory or CMS is changed.

## Reverse again

Reversal preflights all touched files and refuses unexpected drift before changing any. It restores only selected originals, removes only selected newly created files, and preserves unrelated incoming files. A failed application records the available journal pin for recovery. A repeat reversal is safe when the selected files are already original, and creates a new evidence record:

```sh
wt release elizabeth-norman reverse
```

This reverses the latest rehearsal, using its `journal/`, its `target/` and the journal pin that run recorded. To reverse another rehearsal, give `--journal`, `--target` and `--sha` together:

```sh
wt release elizabeth-norman reverse \
  --journal projects/elizabeth-norman/evidence/<rehearsal-run>/journal \
  --sha <journal-sha256-from-results> \
  --target projects/elizabeth-norman/evidence/<rehearsal-run>/target
```

Only this project's marked disposable targets are accepted. This is a regular-file rehearsal, not a deployment adapter or full server backup: ownership, ACLs, extended attributes, empty directories, databases and media stores are outside its restore proof. Its lock coordinates this tool, not arbitrary external writers. Interrupted-write tests exercise the saved journal; they do not establish power-loss durability. Stop and investigate conflicts rather than replacing the target with an old whole-tree copy.

## Marked form delivery and recovery

```sh
wt release elizabeth-norman forms
wt release london-potters forms
```

By default these commands start an isolated loopback form and capture inbox, then close them after testing. They use synthetic identities, `test@example.invalid`, unique `WEBTOOLS-TEST-<UUID>` markers and generated DOCX attachments. They do not visit either live client form or send staff email.

Nine cases run on desktop and mobile: ordinary delivery, no attachment, required-field validation, network loss, HTTP 503, malformed success response, receipt with a lost confirmation, oversized upload and disallowed extension. The harness independently reads the capture inbox, checks the intended recipient, fields and attachment hash, then deletes only its marked record and verifies its absence. A seeded unrelated fixture record must survive. Failures preserve the message, focus the error and allow manual retry. For a lost confirmation, an existing receipt suppresses retry to avoid a duplicate. Screenshots and receipt/cleanup results remain in the report. This tests delivery to the local capture service, not a real mailbox or spam filtering.

### Configured local form

An existing **isolated local form** can use an explicit profile. `--profile` is only for `forms`:

```sh
wt release elizabeth-norman forms --profile projects/elizabeth-norman/local-forms.json
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

## Apply the procedure to a CMS

The platform-neutral order is: identify the exact artifact and intended changes; verify trusted pins; preserve incoming records; take and restore the appropriate backup in isolation; rehearse selective apply and reversal; run marked delivery/recovery checks; then assign owners and evidence to all ten checklist areas. Component success does not approve a launch.

For **WordPress**, separately inventory theme/plugin files, content and option changes. Keep the previous theme and the independent private-upload plugin available. A file journal does not reverse database options, content migrations or plugin state. A production backup must include the database, required files and protected uploads, and be restored into an isolated environment with outbound delivery captured. Preserve submissions, jobs and uploads received since the backup; rolling back a theme must not overwrite the live database. The current kit provides the file rehearsal and checklist, not a WordPress installer or database recovery tool.

For **EmDash**, the London Potters experiment uses Workers, D1 and R2. Record code/static assets separately from bindings, database changes and media. A previous code artifact does not undo D1 migrations or R2 changes. Its existing export helper is a first-import/demo procedure, not a production backup strategy. When a real EmDash release needs this kit, follow that repository's `AGENTS.md` and existing Wrangler configuration and add a proven isolated database/media restore procedure. No EmDash deployment adapter is implemented here.

## Exit codes

**0** means the requested local operation passed; **2** means a recorded rehearsal/form failure; **1** means setup, input or runner failure. [Release verification](../verification-release-2026-11-12.md) records the two real static-bundle rehearsals, local form tests and remaining production checks.
