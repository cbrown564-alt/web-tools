# London Potters captures

The PNG files are real first-viewport screenshots captured on 12 November 2026. `manifest.json` owns each source URL, resolved URL, UTC timestamp, dimensions, HTTP result and SHA-256 hash. Desktop is 1440 × 1050; mobile is 390 × 844. Both use CSS-pixel dimensions, reduced motion, a fresh unauthenticated browser context and the Europe/London timezone.

The before source is the existing London Potters public website. The after source is the hosted EmDash demonstration, which was built from a public archive of the website taken on 5 November 2026 rather than the organisation's own database. Differences in listed profiles and ticket counts reflect that archive date. Payments, bookings and sign-in are inactive in the demonstration. These captures are review material, not proof of client acceptance or an authorised migration.

Website content, branding and photographs belong to London Potters and its members. These images reproduce those pages for this project comparison; they are not stock assets for other projects.

Run `PROJECT=london-potters npm run capture` to fill missing original captures and refresh demonstration captures. Existing original captures are skipped unless `--replace-baseline` is explicitly supplied.
