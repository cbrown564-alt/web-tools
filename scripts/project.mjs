import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateProject } from "../src/model.js";
import { validateSiteCheckProject } from "./site-check/core.mjs";

// One project per command and per build: a hosted review never carries another client's material.
export const projectId = process.env.PROJECT || "research-network";
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(projectId))
  throw new Error(`PROJECT must be a folder name in projects/: ${projectId}`);
export const projectDir = resolve("projects", projectId);

export async function loadProject({ siteCheck = false } = {}) {
  let text;
  try {
    text = await readFile(resolve(projectDir, "project.json"), "utf8");
  } catch (e) {
    if (e.code === "ENOENT")
      throw new Error(
        `No project record at projects/${projectId}/project.json`,
      );
    throw e;
  }
  const record = JSON.parse(text);
  if (!siteCheck && record.kind === "site-check")
    throw new Error(
      `${projectId} is a live-site check record. Use npm run site-check; comparison builds need paired pages and captures.`,
    );
  const project = siteCheck
    ? validateSiteCheckProject(record)
    : validateProject(record);
  if (project.id !== projectId)
    throw new Error(
      `projects/${projectId}/project.json has id "${project.id}"; the folder and id must match.`,
    );
  return project;
}
