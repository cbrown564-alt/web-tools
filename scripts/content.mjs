import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
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
async function main() {
  const { values: o, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      inventory: { type: "string" },
      site: { type: "string" },
      run: { type: "string" },
      map: { type: "string" },
      base: { type: "string" },
      "allow-partial": { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  const action = positionals[0] || "prepare";
  if (o.help) {
    console.log(
      "Prepare: PROJECT=<id> npm run content -- [prepare] [--inventory <inventory-run>] [--site before|after|live] [--run unique-name]\nCheck: PROJECT=<id> npm run content -- check --map <exported-map.json> [--base https://preview.example] [--allow-partial] [--run unique-name]\nOutputs are immutable local evidence. No redirect is installed.",
    );
    return;
  }
  if (!["prepare", "check"].includes(action) || positionals.length > 1)
    throw Error("Use content prepare or content check");
  for (const name of ["run", "inventory", "site"])
    if (o[name] && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(o[name]))
      throw Error(`Invalid --${name}`);
  const project = await loadProject({ siteCheck: true }),
    name =
      o.run ||
      `${new Date().toISOString().slice(0, 10)}-content-${action}-${randomUUID().slice(0, 8)}`;
  let source, sourceBytes, manifest, map;
  if (action === "prepare") {
    let inventoryRun = o.inventory;
    if (!inventoryRun) {
      const site =
        o.site ||
        (project.sites.length === 1
          ? project.sites[0].id
          : project.inventory?.site);
      if (!site) throw Error("Choose --site or --inventory");
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
    if (!o.map) throw Error("Check needs --map <exported-file.json>");
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
      throw Error(
        "Map is partial; finish decisions or explicitly use --allow-partial",
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
    await writeFile(
      resolve(dir, "report.html"),
      reportDocument(
        `${project.name} — Redirect check`,
        `<main><h1>${e(project.name)} — Redirect check</h1><p>${e(data.state)} · ${data.rows.filter((r) => r.status === "pass").length}/${data.rows.length} rules passed · ${map.complete ? "Complete decision map" : "Partial map: only exported rules checked"}</p><p>Request base: ${e(data.base)}. Coverage: ${e(JSON.stringify(map.coverage))}.</p><div class="scroll" tabindex="0" role="region" aria-label="Redirect results"><table><thead><tr><th>Source</th><th>Expected</th><th>Result</th><th>Observed chain</th></tr></thead><tbody>${data.rows.map((r) => `<tr><td>${e(r.source)}</td><td>${r.expectedStatus} ${e(r.expectedDestination)}</td><td>${r.status}: ${e(r.error || "matched")}</td><td>${e(JSON.stringify(r.chain))}</td></tr>`).join("")}</tbody></table></div><p>GET requests only. Retained URLs require an initial 200; removal requires its exact 404/410; consolidation requires the specified initial status, one redirect to the exact destination, and HTTP 200 there. Every hop is recorded; unexpected origins, loops, chains and failed destinations fail the check.</p><p><a href="results.json">Results</a> · <a href="map.json">Checked rules</a> · <a href="conditions.json">Conditions</a></p></main>`,
        `main{overflow-wrap:anywhere}table{table-layout:fixed;min-width:700px}`,
      ),
    );
    console.log(`Report: ${dir}/report.html`);
    if (data.state !== "passed") process.exitCode = 2;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    console.error(`Content: ${e.message}`);
    process.exitCode = 1;
  });
