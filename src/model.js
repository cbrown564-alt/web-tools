export const fields = { heading: 100, summary: 260, beforeNote: 220, afterNote: 220 };
export const storageKey = id => `web-tools:comparison:${id}:v1`;
export function validateNotes(value, project) {
  if (!value || value.version !== 1 || value.projectId !== project.id || !value.pages || typeof value.pages !== 'object' || Array.isArray(value.pages)) throw new Error('Choose a notes file exported for this project.');
  const pages = {};
  for (const [id, notes] of Object.entries(value.pages)) {
    if (!project.pages.some(p => p.id === id) || !notes || typeof notes !== 'object' || Array.isArray(notes)) throw new Error('The notes file contains an unknown page.');
    pages[id] = {};
    for (const [field, limit] of Object.entries(fields)) {
      if (typeof notes[field] !== 'string' || !notes[field].trim() || notes[field].length > limit) throw new Error(`Invalid ${field} for ${id}. Keep text within the stated limits.`);
      pages[id][field] = notes[field].trim();
    }
  }
  return { version: 1, projectId: project.id, pages };
}
export function mergePages(project, notes) { return project.pages.map(p => ({ ...p, ...notes.pages[p.id] })); }
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function captureFor(manifest, page, device, side) { return manifest.captures[`${page.id}-${device}-${side}`]; }
export function dateLabel(iso) { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }).format(new Date(iso)); }
