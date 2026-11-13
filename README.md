# Web Tools

Reusable tools for preparing, reviewing, delivering and launching bespoke websites. One project record per client produces consistent material: website comparisons, site checks, page inventories, content decisions, release rehearsals and a post-launch watch. Every tool runs through one command, `wt <tool> <project> [action] [options]`, and writes a local HTML report.

## Requirements and install

Requires Node.js 22.19+ (verified with Node.js 24) and npm.

```sh
git clone <repository-url> web-tools
cd web-tools
npm ci
npx playwright install chromium
```

Performance checks at the minimal tier use Google PageSpeed Insights. Put `PAGESPEED_INSIGHTS_API_KEY=your-key` in a plain-text `.env` file at the repository root (see `.env.example`). The CLI loads it automatically; `.env` and `.env.*` are ignored by Git. Never give the key a `VITE_` prefix, which would expose it to browser code. Without a key, a minimal site check skips performance and says so.

Run `wt` as `npx wt`, `npm run wt --` or `node scripts/wt.mjs`. The examples below use `npx wt`; the reference pages write plain `wt`.

## Quick start

Check the setup, create a record for a live site, run a minimal site check and see where the job stands:

```sh
npx wt doctor
npx wt new acme --url https://www.acme.example
npx wt site-check acme
npx wt status acme
```

`wt doctor` checks Node, the dependencies, Chromium, the PageSpeed key, `tar` and disk space, and prints a fix for anything missing. `wt new` reads the site's sitemap or home page links and writes `projects/acme/project.json` with up to five pages; edit that file to change them. `wt site-check` runs the minimal tier on every recorded page and device, names the run itself (for example `2026-11-13-site-check-01`) and prints the report path. Open `projects/acme/evidence/<run>/report.html`, or `projects/acme/index.html`, which lists every report for the project and is rebuilt after each run. `wt status` shows the latest run of each tool and the next command.

Every report opens with three blocks: what was checked, what was found, and what needs a decision. Every command ends with a `Next:` line. `wt <tool> --help` shows a tool's actions and options.

## Tools

| Command         | What it does                                                       | Reference                                           |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| `wt site-check` | Check performance, cache, accessibility, security and discovery    | [site-check.md](docs/reference/site-check.md)       |
| `wt watch`      | Compare a live site with its accepted baseline                     | [watch.md](docs/reference/watch.md)                 |
| `wt inventory`  | Crawl a site into one page inventory with captures                 | [inventory.md](docs/reference/inventory.md)         |
| `wt content`    | Review page decisions and check the redirect map                   | [content.md](docs/reference/content.md)             |
| `wt release`    | Package, verify and rehearse a release; test forms locally         | [release.md](docs/reference/release.md)             |
| `wt capture`    | Capture first-screen pairs for the before and after comparison app | [capture.md](docs/reference/capture.md)             |
| `wt status`     | Where a job stands and what to run next                            | [project.md](docs/reference/project.md#wt-status)   |
| `wt index`      | Rebuild the project's page of reports                              | [project.md](docs/reference/project.md#wt-index)    |
| `wt share`      | Bundle one report for a client, without internal evidence          | [project.md](docs/reference/project.md#wt-share)    |
| `wt prune`      | List and remove runs nothing depends on                            | [project.md](docs/reference/project.md#wt-prune)    |
| `wt archive`    | Write one file holding a project's record and evidence             | [project.md](docs/reference/project.md#wt-archive)  |
| `wt restore`    | Unpack an archive and rebuild every report offline                 | [project.md](docs/reference/project.md#wt-restore)  |
| `wt new`        | Create a project record from a live site                           | [project.md](docs/reference/project.md#wt-new)      |
| `wt projects`   | List project records                                               | [project.md](docs/reference/project.md#wt-projects) |
| `wt doctor`     | Check Node, Chromium, the API key and disk space                   | [project.md](docs/reference/project.md#wt-doctor)   |

Options mean the same thing in every tool: `--site`, `--pages`, `--devices`, `--run` and `--render [run]`. Runs are named `<date>-<tool>-NN` automatically, and later steps use the latest run unless `--run` names another. [project.md](docs/reference/project.md) describes the project record, run names and error messages.

Before-and-after comparison is working on two projects. Site check minimal and standard tiers are working; maximum is a bounded investigation prototype. Watch, inventory, content decisions and the release kit are working as manual prototypes. The EmDash starter and promo studio are parked. No project here is client-approved or launched by inclusion. Each reference page states its tool's status and links its dated verification record; [docs/plan.md](docs/plan.md) has the detail, order and acceptance for each.

## Exit codes

| Code | Meaning                                                                         |
| ---- | ------------------------------------------------------------------------------- |
| 0    | Done. Findings may still need review; read the report                           |
| 1    | Could not start or finish: setup, input or runner failure                       |
| 2    | Finished with something to act on: partial collection, failed checks or changes |
| 3    | Watch only: no accepted baseline yet                                            |

Errors print the cause and a `Next:` line with the command that fixes it. Set `WT_DEBUG=1` to see stack traces.

## Before and after comparison app

The comparison app is a static review of paired screenshots with a side-by-side PDF export. It works on one paired project, chosen with the `PROJECT` environment variable (default `research-network`).

```sh
npm run dev
npm run build
npm run preview
npm run package
npm run check
```

`dev` serves the review locally, normally at `http://127.0.0.1:4173`. `build` writes `dist/` for any static host, `preview` serves that build, `package` writes `output/<project>-review-static.tar.gz`, and `check` runs the tests, a build and the browser verification. Captures are prepared with `wt capture <project>`. [capture.md](docs/reference/capture.md) covers hosting, notes, PDF export, verification and limits.

## Document owners

- [PRODUCT.md](PRODUCT.md) owns intended behaviour, scope, priorities and prototype acceptance criteria.
- [docs/plan.md](docs/plan.md) owns what is built next, in what order, and what done means for each tool.
- [docs/experience.md](docs/experience.md) owns the work on operator and reader experience, with its exit gates.
- This README and [docs/reference/](docs/reference/) own repository navigation, setup, commands and operational instructions.
- Source code and tests own implementation facts. Capture manifests own image provenance. Dated verification records describe checks, not client acceptance.
