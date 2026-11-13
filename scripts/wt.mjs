#!/usr/bin/env node
// The one front door. Every tool is `wt <tool> <project> [action] [options]`.
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tools, vocabulary, help, nearest, parseTool } from "./cli/grammar.mjs";
import { CliError, report } from "./cli/errors.mjs";

// Commands are written relative to the repository, wherever wt is called from.
// WT_ROOT points the tools at another folder of projects; the tests use it.
process.chdir(
  process.env.WT_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), ".."),
);

const RUNNERS = {
  "site-check": "./site-check.mjs",
  watch: "./watch.mjs",
  inventory: "./inventory.mjs",
  content: "./content.mjs",
  release: "./release.mjs",
  capture: "./capture.mjs",
};

async function main() {
  const [tool, ...rest] = process.argv.slice(2);
  const context = { tool };
  try {
    if (!tool || tool === "help" || tool === "--help" || tool === "-h") {
      console.log(help(rest[0]));
      return;
    }
    const spec = tools[tool];
    if (!spec) {
      context.tool = undefined;
      const guess = nearest(tool, Object.keys(tools));
      throw new CliError(
        `There is no tool called ${tool}`,
        guess ? `wt ${guess} --help` : "wt --help",
      );
    }
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(help(tool));
      return;
    }
    // Separate the project from the tool's own action; either may come first.
    const actions = Object.keys(spec.actions || {});
    const args = [];
    let project;
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a.startsWith("--")) {
        args.push(a);
        const name = a.slice(2);
        if (
          !a.includes("=") &&
          vocabulary[name]?.[0] &&
          rest[i + 1] !== undefined &&
          !rest[i + 1].startsWith("--") &&
          !(
            name === "render" &&
            existsSync(resolve("projects", rest[i + 1], "project.json")) &&
            !project
          )
        )
          args.push(rest[++i]);
      } else if (!spec.noProject && !project && !actions.includes(a))
        project = a;
      else args.push(a);
    }
    if (!spec.noProject) project ||= process.env.PROJECT;
    context.project = project;
    if (spec.newProject) {
      const { newProject } = await import("./cli/admin.mjs");
      return await newProject(project, parseTool(tool, args).values);
    }
    if (!spec.noProject && !spec.projectOptional && !project)
      throw new CliError(
        `${tool} needs a project`,
        `wt projects   (to list them), then: wt ${tool} <project>`,
      );
    if (project && !existsSync(resolve("projects", project, "project.json"))) {
      const { projectIds } = await import("./cli/status.mjs");
      const guess = nearest(project, await projectIds());
      throw new CliError(
        `No project named ${project}`,
        guess
          ? `wt ${tool} ${guess}`
          : `wt projects   (to list them)   or   wt new ${project} --url https://...`,
      );
    }
    if (project) process.env.PROJECT = project;
    if (spec.key)
      try {
        process.loadEnvFile(".env");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }

    if (RUNNERS[tool]) {
      const { main: run } = await import(RUNNERS[tool]);
      await run(args);
      // Every finished command ends by saying where the job stands.
      if (!args.includes("--render")) await after(project);
      return;
    }
    const { values } = parseTool(tool, args);
    if (tool === "projects")
      return await (await import("./cli/admin.mjs")).projects();
    if (tool === "doctor")
      return await (await import("./cli/admin.mjs")).doctor();
    if (tool === "status") {
      const { projectIds, projectStatus, statusText } =
        await import("./cli/status.mjs");
      const ids = project ? [project] : await projectIds();
      if (!ids.length)
        return console.log(
          "No projects yet.\nNext: wt new <id> --url https://...",
        );
      for (const [i, id] of ids.entries()) {
        if (i) console.log("\n" + "-".repeat(60) + "\n");
        console.log(statusText(await projectStatus(id)));
      }
      return;
    }
    if (tool === "index") {
      const { writeIndex } = await import("./cli/status.mjs");
      const { file } = await writeIndex(project);
      return console.log(`Reports: ${file}`);
    }
    if (tool === "share")
      return await (await import("./cli/share.mjs")).share(project, values);
    const storage = await import("./cli/storage.mjs");
    if (tool === "prune") return await storage.prune(project, values);
    if (tool === "archive") return await storage.archive(project, values);
    if (tool === "restore") return await storage.restore(values);
  } catch (error) {
    report(error, context);
    process.exitCode = 1;
  }
}
async function after(project) {
  try {
    const { writeIndex } = await import("./cli/status.mjs");
    const { file, status } = await writeIndex(project);
    console.log(`\nAll reports: ${file}\nNext: ${status.next}`);
  } catch {
    /* The index is a convenience; never let it mask the command's own result. */
  }
}
main();
