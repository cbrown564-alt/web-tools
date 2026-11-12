import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateNotes,
  mergePages,
  escapeHtml,
  captureFor,
} from "../src/model.js";
const project = JSON.parse(
  await readFile(new URL("../public/project.json", import.meta.url)),
);
const page = project.pages[0];
const valid = {
  version: 1,
  projectId: project.id,
  pages: {
    home: {
      heading: "A new welcome",
      summary: "A clear introduction.",
      beforeNote: "The original.",
      afterNote: "The proposal.",
    },
  },
};
test("portable notes change copy without replacing source paths or project identity", () => {
  const imported = validateNotes(
    {
      ...valid,
      pages: {
        home: { ...valid.pages.home, beforePath: "https://evil.example" },
      },
    },
    project,
  );
  const merged = mergePages(project, imported);
  assert.equal(merged[0].heading, "A new welcome");
  assert.equal(merged[0].beforePath, page.beforePath);
  assert.equal(merged[1].heading, project.pages[1].heading);
});
test("foreign projects, unknown pages, malformed structures and oversized copy are rejected", () => {
  for (const bad of [
    null,
    {},
    { ...valid, projectId: "other" },
    { ...valid, pages: [] },
    { ...valid, pages: { unknown: {} } },
    {
      ...valid,
      pages: { home: { ...valid.pages.home, heading: "x".repeat(101) } },
    },
    { ...valid, pages: { home: { ...valid.pages.home, summary: "  " } } },
  ])
    assert.throws(() => validateNotes(bad, project));
});
test("untrusted notes render as text rather than executable markup", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});
test("a missing capture is distinguishable from a blank website", () => {
  assert.equal(
    captureFor({ captures: {} }, page, "desktop", "before"),
    undefined,
  );
});
