export const fields = {
  heading: 100,
  summary: 260,
  beforeNote: 220,
  afterNote: 220,
};
const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const labelFields = ["before", "after", "afterNote"];
const text = (value) => typeof value === "string" && value.trim().length > 0;
// The record is the only place project-specific wording lives. Fail early and
// specifically, so a new project cannot silently inherit another's wording.
export function validateProject(project) {
  const fail = (message) => {
    throw new Error(`Invalid project record: ${message}`);
  };
  if (!project || project.version !== 1) fail("version must be 1.");
  if (!slug.test(project.id ?? "")) fail("id must be a lowercase slug.");
  if (!text(project.name)) fail("name is required.");
  for (const key of labelFields)
    if (!text(project.labels?.[key])) fail(`labels.${key} is required.`);
  for (const key of ["beforeBase", "afterBase"]) {
    let url;
    try {
      url = new URL(project[key]);
    } catch {
      fail(`${key} must be a URL.`);
    }
    if (url.protocol !== "https:") fail(`${key} must use https.`);
  }
  // The reader interface offers exactly these two devices.
  if (Object.keys(project.devices ?? {}).join() !== "desktop,mobile")
    fail("devices must be desktop then mobile.");
  for (const [name, d] of Object.entries(project.devices))
    if (!(Number.isInteger(d.width) && Number.isInteger(d.height)))
      fail(`devices.${name} needs integer width and height.`);
  if (!Array.isArray(project.pages) || project.pages.length < 2)
    fail("at least two page pairs are required.");
  const seen = new Set();
  for (const page of project.pages) {
    if (!slug.test(page.id ?? "") || seen.has(page.id))
      fail(`page id "${page.id}" must be a unique lowercase slug.`);
    seen.add(page.id);
    if (!text(page.label)) fail(`${page.id}: label is required.`);
    for (const key of ["beforePath", "afterPath"])
      if (!text(page[key]) || !page[key].startsWith("/"))
        fail(`${page.id}: ${key} must start with "/".`);
    for (const [field, limit] of Object.entries(fields))
      if (!text(page[field]) || page[field].length > limit)
        fail(`${page.id}: ${field} must be 1–${limit} characters.`);
  }
  return project;
}
const words =
  "zero one two three four five six seven eight nine ten eleven twelve".split(
    " ",
  );
export const countWord = (n) => words[n] ?? String(n);
export const ordinal = (n) => String(n).padStart(2, "0");
export const storageKey = (id) => `web-tools:comparison:${id}:v1`;
export function validateNotes(value, project) {
  if (
    !value ||
    value.version !== 1 ||
    value.projectId !== project.id ||
    !value.pages ||
    typeof value.pages !== "object" ||
    Array.isArray(value.pages)
  )
    throw new Error("Choose a notes file exported for this project.");
  const pages = {};
  for (const [id, notes] of Object.entries(value.pages)) {
    if (
      !project.pages.some((p) => p.id === id) ||
      !notes ||
      typeof notes !== "object" ||
      Array.isArray(notes)
    )
      throw new Error("The notes file contains an unknown page.");
    pages[id] = {};
    for (const [field, limit] of Object.entries(fields)) {
      if (
        typeof notes[field] !== "string" ||
        !notes[field].trim() ||
        notes[field].length > limit
      )
        throw new Error(
          `Invalid ${field} for ${id}. Keep text within the stated limits.`,
        );
      pages[id][field] = notes[field].trim().replace(/\s+/g, " ");
    }
  }
  return { version: 1, projectId: project.id, pages };
}
export function mergePages(project, notes) {
  return project.pages.map((p) => ({ ...p, ...notes.pages[p.id] }));
}
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function captureFor(manifest, page, device, side) {
  return manifest.captures[`${page.id}-${device}-${side}`];
}
export function dateLabel(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(iso));
}
