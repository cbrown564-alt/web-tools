# Research Network captures

The PNG files are real first-viewport screenshots captured on 12 November 2026. `manifest.json` owns each source URL, resolved URL, UTC timestamp, dimensions, HTTP result and SHA-256 hash. Desktop is 1440 × 1050; mobile is 390 × 844. Both use CSS-pixel dimensions, reduced motion, a fresh unauthenticated browser context and the Europe/London timezone.

The before source is the existing Research Network public website. The after source is the hosted EmDash preview. These captures are review material, not proof of client acceptance or production launch. The visible blank body on the existing Events page is what the public website rendered, not a capture placeholder.

Website content, branding and photographs belong to their respective owners. These images reproduce those websites for this project comparison; they are not stock assets for other projects. The source project's documentation credits recent gathering photography to Momentz by Izzy. Refer to the original pages for the full context and credits.

Run `npm run capture` to fill missing original captures and refresh proposed captures. Existing original captures are skipped unless `--replace-baseline` is explicitly supplied. A failed capture retains its previous file and manifest record. Refreshing a proposal never refreshes the original baseline implicitly.

For a manual capture, use the same viewport, retain the original source URL and actual capture timestamp, record the scope honestly, and update the SHA-256 in the manifest. `npm run check` verifies image dimensions and hashes. Do not substitute blank images for failed requests.
