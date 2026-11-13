# wt watch

```
wt watch <project> [action] [options]
```

Compare a live site with its accepted baseline.

| Action   | Meaning                          |
| -------- | -------------------------------- |
| `run`    | Capture and compare (default)    |
| `accept` | Make a reviewed run the baseline |

| Option                       | Meaning                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--site <id[,id]>`           | Site to use: before, after, live or a competitor id                                                          |
| `--pages <id[,id]>`          | Limit to these recorded pages                                                                                |
| `--devices <desktop,mobile>` | Limit to these devices                                                                                       |
| `--skip-site-check`          | Captures and assertions only                                                                                 |
| `--run <name>`               | Name the run this command creates, or choose the run it acts on. Default: the next number, or the latest run |
| `--render [run]`             | Rebuild a saved report without measuring. Default: latest                                                    |

Status: working as a manual prototype on Velocity and Red Thread. It runs by hand; scheduling and notifications are not configured.

## Run a watch

The watch captures every recorded page on desktop and mobile, checks the project's assertions, runs the minimal site check using the local PageSpeed key, and compares with the last accepted baseline.

```sh
wt watch velocity
wt watch unitedstats
wt watch london-potters --site after
```

The complete watch needs `PAGESPEED_INSIGHTS_API_KEY` in `.env`. Without it the command stops with `Next: wt doctor`; `--skip-site-check` is the alternative.

The first run needs a baseline and exits 3. Open the printed report, review the captures and findings, then accept the run and watch again:

```sh
wt watch velocity accept
wt watch velocity
```

`accept` takes the latest finished watch run for the site. Use `--run <name>` to accept an earlier reviewed run instead, for example `wt watch velocity accept --run 2026-11-13-watch-01`.

## Output

Runs are named `<date>-watch-NN`. Each run writes `results.json`, `conditions.json`, PNG captures, difference images and a portable `report.html` under `projects/<id>/evidence/<run>/`. The nested `site-check/` folder contains its full minimal report and evidence; the same check is also saved as the run `<run>-check`. The report opens with what was checked, what was found and what needs a decision. It puts changed captures side by side and lists failed assertions and new/resolved site-check findings. Existing findings remain in the linked minimal report.

Acceptance records a local pointer under `projects/<id>/watch/<site>.json`; both watch state and evidence are ignored by Git. Keep these folders together or back them up to retain the accepted baseline ([`wt archive`](project.md#wt-archive)). Saved runs are never overwritten. A stale accept command, failed assertion, failed capture, incomplete site check or changed project policy is refused.

## Scope

Use `--pages home,gallery`, `--devices mobile` and `--run <name>` to choose scope. Paired records require `--site before` or `--site after`, unless `watch.site` in the project record sets a default; a live record selects its only site. One baseline exists per site, so changing page/device scope, viewports, assertion settings or whether the minimal check is included requires reviewing a fresh baseline. `--skip-site-check` explicitly selects a visual/assertion-only run and labels the omission. It is useful for local fixtures, not equivalent to the complete watch.

Rebuild HTML offline without collecting again or changing acceptance:

```sh
wt watch velocity --render
wt watch velocity --render 2026-11-13-watch-01
```

## Exit codes

**0** unchanged, accepted, or rendered; **3** first/new baseline required; **2** changes or failures needing review; **1** setup failure. Acceptance acknowledges the observed state; it does not certify the site healthy. The watch compares discrete accessibility, security and discovery findings, including counts of affected accessibility elements. Performance scores and cache timings remain evidence rather than generating alerts for routine measurement variation.

## Assertions

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

## Capture and comparison limits

Capture scrolls vertically to load visible lazy images and waits for fonts and images. It stops with a reported failure above 50,000px height, 24 million pixels, or 150 scroll steps; it never saves a truncated baseline. If the document changes height during a screenshot, it retries up to three captures, recording the attempt count; a persistent mismatch fails. Horizontally off-screen carousel slides are outside this capture. CSS animations are disabled and reduced motion requested; video, JavaScript-driven motion, changing content and browser/font differences may still require review. No clock or content is silently frozen.

Anti-alias differences are ignored; the pixel colour threshold defaults to 0.15 and any remaining changed pixel or dimension change requires review. Explicit `masks` cover configured selectors in both captures; use them sparingly because masked changes become invisible. Mask matches and comparison settings are recorded. No masks are configured for the two live records.

[Watch verification](../verification-watch-2026-11-12.md) records the engineering checks.
