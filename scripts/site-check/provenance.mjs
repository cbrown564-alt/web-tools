import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

// Explicit inputs exclude local environment files and generated evidence.
export const collectorFiles = [
  "scripts/inventory/core.mjs",
  "scripts/inventory/crawl.mjs",
  "scripts/inventory/network.mjs",
  "package.json",
  "package-lock.json",
  "src/model.js",
  "scripts/project.mjs",
  "scripts/report.mjs",
  "scripts/site-check.mjs",
  ...[
    "core",
    "browser",
    "performance",
    "report",
    "security",
    "sitemap",
    "provenance",
    "maximum",
    "maximum-core",
    "maximum-browser",
    "maximum-report",
  ].map((n) => `scripts/site-check/${n}.mjs`),
];
export async function collectorProvenance(root = process.cwd()) {
  const files = await Promise.all(
    collectorFiles.map(async (file) => ({
      file,
      sha256: createHash("sha256")
        .update(await readFile(resolve(root, file)))
        .digest("hex"),
    })),
  );
  return {
    sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  };
}
