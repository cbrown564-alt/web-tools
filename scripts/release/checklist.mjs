export const launchAreas = [
  [
    "journeys",
    "Primary visitor journeys",
    "Complete the main visitor loop, including empty, closed and recovery states.",
  ],
  [
    "forms",
    "Forms and delivery",
    "Check mandatory/optional fields, marked receipt in the intended inbox, attachments, repeat submissions, failures and cleanup.",
  ],
  [
    "privacy",
    "Identity and privacy",
    "Check signed-out/signed-in boundaries, private files, retention and absence of private values in logs.",
  ],
  [
    "integrations",
    "Data and integrations",
    "Record a baseline; verify normal updates, edits, expiry/withdrawal and external destinations without duplicates.",
  ],
  [
    "content",
    "Content and links",
    "Review intended content, redirects/removals, downloads, images, CTAs, legal pages, breadcrumbs and 404 recovery.",
  ],
  [
    "accessibility",
    "Accessibility",
    "Check keyboard/focus, labels and errors, headings, contrast, zoom, reduced motion and screen-reader behaviour.",
  ],
  [
    "browsers",
    "Browsers and layout",
    "Check representative templates on phone/desktop and actual supported browsers/devices; record unavailable coverage.",
  ],
  [
    "performance",
    "Performance and caching",
    "Compare cold/repeat critical pages, asset loading/layout shifts and caching of dynamic or private responses.",
  ],
  [
    "discovery",
    "Discovery and measurement",
    "Verify URL treatment, canonicals, sitemaps, indexing, sharing, consent and intended measurement.",
  ],
  [
    "recovery",
    "Operations and recovery",
    "Rehearse selective apply/reversal and a full restore, preserve incoming records, verify editing and name an incident responder.",
  ],
];
export function checklist(projectId) {
  return {
    version: 1,
    tool: "launch-checklist",
    projectId,
    source: "Liz docs/planning/design-brief.md — Required test coverage",
    areas: launchAreas.map(([id, title, checks]) => ({
      id,
      title,
      checks,
      status: "pending",
      owner: "",
      evidence: [],
    })),
  };
}
export function checklistMarkdown(data) {
  return (
    `# Launch checklist\n\nProject: ${data.projectId}\n\n` +
    data.areas
      .map(
        (a) =>
          `- [ ] **${a.title}** — ${a.checks}\n  Owner: ______ · Evidence: ______\n`,
      )
      .join("\n")
  );
}
