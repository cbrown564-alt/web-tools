import { defineConfig } from "vite";
import { cp } from "node:fs/promises";
import { createReadStream, statSync } from "node:fs";
import { resolve, extname, sep, basename } from "node:path";
import { loadProject, projectDir } from "./scripts/project.mjs";
import { escapeHtml } from "./src/model.js";

const types = { ".json": "application/json", ".png": "image/png" };

// Serves the selected project's record and captures at the site root in
// development, and copies only that project into the build.
function projectFiles() {
  let outDir, command, project;
  return {
    name: "project-files",
    async configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      command = config.command;
      project = await loadProject();
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        );
        if (path !== "/project.json" && !path.startsWith("/captures/"))
          return next();
        const file = resolve(projectDir, `.${path}`);
        try {
          if (!file.startsWith(projectDir + sep) || !statSync(file).isFile())
            throw new Error("Not a project file");
        } catch {
          res.statusCode = 404;
          return res.end("Not found");
        }
        res.setHeader(
          "Content-Type",
          types[extname(file)] || "application/octet-stream",
        );
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(file).pipe(res);
      });
    },
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html
          .replaceAll("%PROJECT_NAME%", escapeHtml(project.name))
          .replaceAll(
            "%PROJECT_DESCRIPTION%",
            escapeHtml(
              `A considered before-and-after review of the ${project.name} website. Compare the ${project.labels.before.toLowerCase()} with the ${project.labels.after.toLowerCase()} and export a side-by-side PDF.`,
            ),
          ),
    },
    async closeBundle() {
      if (command !== "build") return;
      await cp(
        resolve(projectDir, "project.json"),
        resolve(outDir, "project.json"),
      );
      await cp(resolve(projectDir, "captures"), resolve(outDir, "captures"), {
        recursive: true,
        filter: (source) => basename(source) !== "README.md",
      });
    },
  };
}

export default defineConfig({ plugins: [projectFiles()] });
