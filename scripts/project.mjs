import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateProject } from "../src/model.js";
import { validateSiteCheckProject } from "./site-check/core.mjs";
import { CliError } from "./cli/errors.mjs";

// One project per command and per build: a hosted review never carries another client's material.
export const projectId = process.env.PROJECT || "research-network";
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(projectId))
  throw new CliError(
    `${projectId} is not a project id (lowercase letters, digits and hyphens)`,
    "wt projects",
  );
export const projectDir = resolve("projects", projectId);

export async function loadProject({ siteCheck = false } = {}) {
  let text;
  try {
    text = await readFile(resolve(projectDir, "project.json"), "utf8");
  } catch (e) {
    if (e.code === "ENOENT")
      throw new CliError(
        `No project named ${projectId} (looked for projects/${projectId}/project.json)`,
        `wt projects   (to list them)   or   wt new ${projectId} --url https://...`,
      );
    throw e;
  }
  let record;
  try {
    record = JSON.parse(text);
  } catch (e) {
    throw new CliError(
      `projects/${projectId}/project.json is not valid JSON: ${e.message}`,
      `Fix that file, then wt status ${projectId}`,
    );
  }
  if (!siteCheck && record.kind === "site-check")
    throw new CliError(
      `${projectId} records one live site; the before and after comparison needs a paired record`,
      `wt site-check ${projectId}   or   wt watch ${projectId}`,
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
