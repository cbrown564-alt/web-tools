import { readFile, writeFile, mkdir, statfs } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { CliError } from "./errors.mjs";
import { projectIds, projectStatus } from "./status.mjs";
import { request, validateSiteCheckProject } from "../site-check/core.mjs";

export async function projects() {
  const ids = await projectIds();
  if (!ids.length) {
    console.log("No projects yet.\nNext: wt new <id> --url https://...");
    return;
  }
  const width = Math.max(...ids.map((i) => i.length));
  for (const id of ids) {
    try {
      const s = await projectStatus(id);
      console.log(
        `${id.padEnd(width)}  ${s.project.sites
          .map((x) => x.id)
          .join(", ")
          .padEnd(14)}  ${s.runs.length} runs  ${s.project.sites[0].baseUrl}`,
      );
    } catch (error) {
      console.log(
        `${id.padEnd(width)}  record cannot be read: ${error.message}`,
      );
    }
  }
  console.log("\nNext: wt status <project>");
}

export async function doctor() {
  const rows = [];
  const check = (name, ok, detail, fix, required = true) =>
    rows.push({ name, ok, detail, fix, required });
  const need = JSON.parse(await readFile("package.json")).engines.node.replace(
    ">=",
    "",
  );
  const [a, b] = process.versions.node.split(".").map(Number),
    [na, nb] = need.split(".").map(Number);
  check(
    "Node.js",
    a > na || (a === na && b >= nb),
    `${process.versions.node} (needs ${need} or newer)`,
    `Install Node.js ${need} or newer`,
  );
  const installed = existsSync("node_modules/playwright/package.json");
  check(
    "Dependencies",
    installed,
    installed ? "installed" : "node_modules is missing",
    "npm ci",
  );
  if (installed) {
    const { chromium } = await import("playwright");
    const path = chromium.executablePath();
    check(
      "Chromium",
      existsSync(path),
      existsSync(path) ? "installed" : "not downloaded",
      "npx playwright install chromium",
    );
  }
  try {
    process.loadEnvFile(".env");
  } catch {}
  check(
    "PageSpeed key",
    Boolean(process.env.PAGESPEED_INSIGHTS_API_KEY),
    process.env.PAGESPEED_INSIGHTS_API_KEY
      ? "set"
      : "not set: site checks skip performance at the minimal tier",
    "Put PAGESPEED_INSIGHTS_API_KEY=your-key in .env (see .env.example)",
    false,
  );
  let tar = true;
  try {
    execFileSync("tar", ["--version"], { stdio: "ignore" });
  } catch {
    tar = false;
  }
  check(
    "tar",
    tar,
    tar ? "available" : "not found",
    "Install tar; release packages and archives need it",
    false,
  );
  const fs = await statfs(".");
  const free = (fs.bavail * fs.bsize) / 1e9;
  check(
    "Disk space",
    free > 5,
    `${free.toFixed(1)} GB free`,
    "Free some space: wt prune <project> lists what can go",
    false,
  );
  const ids = await projectIds();
  check(
    "Projects",
    ids.length > 0,
    `${ids.length} record${ids.length === 1 ? "" : "s"}`,
    "wt new <id> --url https://...",
    false,
  );
  for (const r of rows)
    console.log(
      `${r.ok ? "ok     " : r.required ? "MISSING" : "note   "} ${r.name.padEnd(14)} ${r.detail}${r.ok ? "" : `\n        Fix: ${r.fix}`}`,
    );
  const blocking = rows.filter((r) => !r.ok && r.required);
  console.log(
    blocking.length
      ? `\n${blocking.length} thing${blocking.length === 1 ? "" : "s"} to fix before the tools will run.\nNext: ${blocking[0].fix}`
      : `\nReady.\nNext: ${ids.length ? "wt status" : "wt new <id> --url https://..."}`,
  );
  if (blocking.length) process.exitCode = 1;
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const title = (s) => s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

// Pick a handful of pages a person would recognise: the home page and the
// shortest top-level paths the site itself advertises.
export function candidatePages(base, urls, limit = 5) {
  const origin = new URL(base).origin;
  const pages = [{ id: "home", label: "Home", path: "/" }];
  const seen = new Set(["home"]);
  const paths = [
    ...new Set(
      urls
        .map((u) => {
          try {
            const x = new URL(u, base);
            return x.origin === origin && !x.search ? x.pathname : null;
          } catch {
            return null;
          }
        })
        .filter(
          (p) =>
            p &&
            p !== "/" &&
            !/\.(xml|pdf|jpe?g|png|gif|webp|svg|css|js|json|zip|txt)$/i.test(
              p,
            ) &&
            !/\/(wp-|feed|tag|category|author|page\/\d|cart|checkout|login|account)/i.test(
              p,
            ),
        ),
    ),
  ].sort(
    (a, b) =>
      a.split("/").filter(Boolean).length -
        b.split("/").filter(Boolean).length || a.length - b.length,
  );
  for (const path of paths) {
    if (pages.length >= limit) break;
    const id = slug(path.split("/").filter(Boolean).pop() || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    pages.push({ id, label: title(id), path });
  }
  return pages;
}

export async function newProject(id, values) {
  if (!id)
    throw new CliError(
      "Name the new project",
      "wt new <id> --url https://www.example.com",
    );
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))
    throw new CliError(
      `${id} is not usable as an id (lowercase letters, digits and hyphens)`,
      `wt new ${slug(id) || "my-site"} --url https://...`,
    );
  const dir = resolve("projects", id);
  if (existsSync(resolve(dir, "project.json")))
    throw new CliError(`${id} already exists`, `wt status ${id}`);
  let url = values.url;
  if (!url && process.stdin.isTTY) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    url = (await rl.question("Live site URL (https://...): ")).trim();
    rl.close();
  }
  if (!url)
    throw new CliError(
      "A new project needs its live site",
      `wt new ${id} --url https://www.example.com`,
    );
  let base;
  try {
    base = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);
  } catch {
    throw new CliError(
      `${url} is not a URL`,
      `wt new ${id} --url https://www.example.com`,
    );
  }
  if (base.protocol !== "https:")
    throw new CliError(
      "The site must use HTTPS",
      `wt new ${id} --url https://${base.host}`,
    );
  let home;
  try {
    home = await request(base.origin + "/", { body: true });
  } catch (error) {
    throw new CliError(
      `Could not reach ${base.origin}: ${error.message}`,
      "Check the address and your connection, then run the same command again",
    );
  }
  if (home.status < 200 || home.status >= 300)
    throw new CliError(
      `${base.origin} answered HTTP ${home.status}`,
      "Check the address, then run the same command again",
    );
  // Follow the site's own redirect (for example to www) so every check starts at the real address.
  const live = new URL(home.finalUrl || base.origin).origin;
  let urls = [],
    source = "the home page's own links";
  try {
    const { sitemap } = await import("../site-check/sitemap.mjs");
    const map = await sitemap(live, { maxDocuments: 4, sampleSize: 12 });
    if (map.urls?.length) {
      urls = map.urls;
      source = "the sitemap";
    }
  } catch {}
  let name = values.name;
  const html = home.text || "";
  if (!urls.length || !name) {
    const { load } = await import("cheerio");
    const $ = load(html);
    if (!urls.length)
      urls = $("nav a[href], header a[href]")
        .map((_, a) => $(a).attr("href"))
        .get();
    name ||= (
      $('meta[property="og:site_name"]').attr("content") ||
      $("title")
        .text()
        .split(/[|–—-]/)[0] ||
      ""
    ).trim();
  }
  name ||= title(id);
  const record = {
    version: 2,
    kind: "site-check",
    id,
    name,
    site: { id: "live", label: "Live website", baseUrl: live },
    devices: {
      desktop: { width: 1440, height: 1050 },
      mobile: { width: 390, height: 844 },
    },
    pages: candidatePages(live, urls),
  };
  validateSiteCheckProject(record);
  await mkdir(dir, { recursive: true });
  await writeFile(
    resolve(dir, "project.json"),
    JSON.stringify(record, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(`Created projects/${id}/project.json for ${name} (${live})`);
  console.log(`Pages, chosen from ${source}:`);
  for (const p of record.pages) console.log(`  ${p.id.padEnd(16)} ${p.path}`);
  console.log(`Edit that file to change the pages.\nNext: wt site-check ${id}`);
}
