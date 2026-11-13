import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { help, parseTool } from "./cli/grammar.mjs";
import { nextRunName } from "./cli/runs.mjs";
import { writeRedirectReport } from "./content/report.mjs";
import { report as reportError, CliError } from "./cli/errors.mjs";
import { build } from "esbuild";
import { loadProject, projectDir } from "./project.mjs";
import { hash } from "./inventory/core.mjs";
import { redact } from "./site-check/core.mjs";
import { reportDocument } from "./report.mjs";
import { reviewPage } from "./content/page.mjs";
import { checkRule, validateMap } from "./content/check.mjs";
const e = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function main(args = process.argv.slice(2)) {
  const { values: o, action } = parseTool("content", args);
  if (o.help) {
    console.log(help("content"));
    return;
  }
  if (o.inventory === "latest") delete o.inventory;
  for (const name of ["run", "inventory", "site"])
    if (o[name] && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(o[name]))
      throw Error(`Invalid --${name}`);
  const project = await loadProject({ siteCheck: true }),
    name =
      o.run ||
      nextRunName(
        projectDir,
        action === "prepare" ? "content-review" : "redirect-check",
      );
  let source, sourceBytes, manifest, map;
  if (action === "prepare") {
    let inventoryRun = o.inventory;
    if (!inventoryRun) {
      const site =
        o.site ||
        (project.sites.length === 1
          ? project.sites[0].id
          : project.inventory?.site);
      if (!site)
        throw new CliError(
          "This project has more than one site and no default inventory site",
          `wt content ${project.id} --site ${project.sites[0].id}`,
        );
      const pointer = JSON.parse(
        await readFile(resolve(projectDir, "inventory", `${site}.json`)),
      );
      if (pointer.projectId !== project.id)
        throw Error("Inventory pointer belongs to another project");
      inventoryRun = pointer.run;
      if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(inventoryRun))
        throw Error("Invalid inventory pointer");
      source = resolve(projectDir, "evidence", inventoryRun);
      sourceBytes = await readFile(resolve(source, "inventory.json"));
      if (hash(sourceBytes) !== pointer.sha256)
        throw Error("Inventory hash no longer matches its pointer");
    } else {
      source = resolve(projectDir, "evidence", inventoryRun);
      sourceBytes = await readFile(resolve(source, "inventory.json"));
    }
    const inv = JSON.parse(sourceBytes);
    if (
      inv.version !== 1 ||
      inv.projectId !== project.id ||
      !inv.finishedAt ||
      !Array.isArray(inv.pages) ||
      !inv.pages.length
    )
      throw Error("Expected a finished inventory of this project");
    if (o.site && inv.site.id !== o.site)
      throw Error("Inventory is for a different site");
    const result = JSON.parse(await readFile(resolve(source, "results.json")));
    manifest = {
      version: 1,
      tool: "content-review",
      project: { id: project.id, name: project.name },
      inventoryRun,
      inventorySha256: hash(sourceBytes),
      inventoryState: result.state,
      site: inv.site,
      createdAt: new Date().toISOString(),
      devices: Object.keys(project.devices),
      pages: inv.pages.map((p) => ({
        url: p.url,
        title: p.title || "",
        status: p.status,
        collection: p.collection,
        finalUrl: p.finalUrl,
        redirects: (p.chain || []).filter((h) =>
          [301, 302, 303, 307, 308].includes(h.status),
        ).length,
        error: p.error,
        canonicals: p.canonicals || [],
        template: p.template,
        decodedBytes: p.decodedBytes,
        captures: p.captures || [],
      })),
    };
    if (
      new Set(manifest.pages.map((p) => p.url)).size !== manifest.pages.length
    )
      throw Error("Inventory contains duplicate URLs");
  } else {
    if (!o.map)
      throw new CliError(
        "Check needs the redirect map exported from the review page",
        `wt content ${project.id} check --map <downloaded-map.json>`,
      );
    const raw = await readFile(resolve(o.map), "utf8");
    if (raw.length > 10000000) throw Error("Map exceeds 10MB");
    map = validateMap(JSON.parse(raw));
    const sites = [...project.sites, ...(project.inventory?.competitors || [])];
    if (
      !sites.some(
        (s) =>
          new URL(s.baseUrl).origin === new URL(map.sourceSite.baseUrl).origin,
      )
    )
      throw Error("Map source site is not recorded in this project");
    if (map.projectId !== project.id)
      throw Error("Map belongs to another project");
    if (!map.complete && !o["allow-partial"])
      throw new CliError(
        "This map still has undecided pages",
        `Finish the decisions and export again, or add --allow-partial to check only the decided rules`,
      );
    if (o.base) {
      const u = new URL(o.base);
      if (
        !["https:", "http:"].includes(u.protocol) ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== "/"
      )
        throw Error("--base must be a plain HTTP(S) origin");
    }
  }
  const root = resolve(projectDir, "evidence");
  await mkdir(root, { recursive: true });
  const dir = resolve(root, name);
  await mkdir(dir);
  const json = async (file, data) =>
    writeFile(resolve(dir, file), JSON.stringify(redact(data), null, 2) + "\n");
  const files = await Promise.all(
    [
      "package.json",
      "package-lock.json",
      "scripts/project.mjs",
      "scripts/report.mjs",
      "scripts/content.mjs",
      "scripts/content/page.mjs",
      "scripts/content/check.mjs",
      "src/content/app.js",
      "src/content/model.js",
    ].map(async (file) => ({ file, sha256: hash(await readFile(file)) })),
  );
  await json("conditions.json", {
    createdAt: new Date().toISOString(),
    node: process.version,
    collector: { sha256: hash(JSON.stringify(files)), files },
    options: o,
    ...(map
      ? { mapSha256: hash(JSON.stringify(map)) }
      : { inventorySha256: manifest.inventorySha256 }),
  });
  if (action === "prepare") {
    await mkdir(resolve(dir, "captures"));
    const images = new Map();
    for (const page of manifest.pages)
      for (const c of page.captures) {
        if (!c.file) continue;
        try {
          const original = resolve(source, c.file);
          if (!original.startsWith(source + sep) || !c.sha256)
            throw Error("Invalid capture provenance");
          const data = await readFile(original);
          if (hash(data) !== c.sha256) throw Error("Capture hash mismatch");
          if (!images.has(original)) {
            const dest = `captures/${String(images.size + 1).padStart(4, "0")}.png`;
            await copyFile(original, resolve(dir, dest));
            images.set(original, dest);
          }
          c.file = images.get(original);
        } catch (error) {
          delete c.file;
          c.status = "error";
          c.error = error.message;
        }
      }
    await json("manifest.json", manifest);
    const bundled = await build({
      entryPoints: ["src/content/app.js"],
      bundle: true,
      write: false,
      format: "iife",
      minify: true,
      target: "es2022",
    });
    await writeFile(
      resolve(dir, "index.html"),
      reviewPage(manifest, bundled.outputFiles[0].text),
    );
    console.log(
      `Review: ${dir}/index.html\n${manifest.pages.length} URLs; ${images.size} verified capture files copied. Every decision starts undecided.`,
    );
  } else {
    await json("map.json", map);
    const data = {
      version: 1,
      tool: "redirect-check",
      project: { id: project.id, name: project.name },
      run: name,
      startedAt: new Date().toISOString(),
      base: o.base || "exported source URLs",
      coverage: map.coverage,
      mapComplete: map.complete,
      rows: [],
    };
    for (const rule of map.rules) {
      if (data.rows.length)
        await new Promise((resolve) => setTimeout(resolve, 250));
      data.rows.push(redact(await checkRule(rule, { base: o.base })));
      console.log(
        `${data.rows.length}/${map.rules.length}: ${data.rows.at(-1).status}`,
      );
      await json("results.json", data);
    }
    data.finishedAt = new Date().toISOString();
    data.state = data.rows.every((r) => r.status === "pass")
      ? "passed"
      : "failed";
    await json("results.json", data);
    await writeRedirectReport(dir, data);
    console.log(`Report: ${dir}/report.html`);
    if (data.state !== "passed") process.exitCode = 2;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    reportError(e, { tool: "content", project: process.env.PROJECT });
    process.exitCode = 1;
  });
