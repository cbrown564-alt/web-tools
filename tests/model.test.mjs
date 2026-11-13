import { validateSiteCheckProject } from "../scripts/site-check/core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
  validateNotes,
  mergePages,
  escapeHtml,
  captureFor,
  validateProject,
  countWord,
  ordinal,
} from "../src/model.js";
const project = JSON.parse(
  await readFile(
    new URL("../projects/research-network/project.json", import.meta.url),
  ),
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
test("every project record is complete, and incomplete records are rejected", async () => {
  const root = new URL("../projects/", import.meta.url);
  const ids = (await readdir(root, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  assert(ids.length >= 2);
  for (const id of ids) {
    const record = JSON.parse(
      await readFile(new URL(`${id}/project.json`, root)),
    );
    assert.equal(validateSiteCheckProject(record).id, id);
    if (record.version === 1) assert.equal(validateProject(record).id, id);
  }
  for (const bad of [
    { ...project, labels: { ...project.labels, after: "" } },
    { ...project, labels: undefined },
    { ...project, pages: project.pages.slice(0, 1) },
    { ...project, pages: [...project.pages, project.pages[0]] },
    { ...project, afterBase: "http://insecure.example" },
    { ...project, devices: { desktop: project.devices.desktop } },
    {
      ...project,
      pages: [{ ...page, heading: "x".repeat(101) }, project.pages[1]],
    },
  ])
    assert.throws(() => validateProject(bad), /Invalid project record/);
});
test("page counts and numbering follow the record", () => {
  assert.equal(countWord(4), "four");
  assert.equal(countWord(5), "five");
  assert.equal(countWord(13), "13");
  assert.equal(ordinal(3), "03");
  assert.equal(ordinal(12), "12");
});
