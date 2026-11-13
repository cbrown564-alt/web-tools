import { readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, relative, sep } from "node:path";
import { load } from "cheerio";
import { CliError } from "./errors.mjs";
import { listRuns, resolveRun, kinds } from "./runs.mjs";
import { renderDir } from "./render.mjs";

// What a client may receive: the report pages and the pictures they show.
const PICTURE = /\.(png|jpe?g|webp|gif|svg)$/i;
const SHAREABLE = Object.keys(kinds).filter(
  (k) => !["other", "content-review"].includes(k),
);

// Copy one report page into the bundle. Operator-only and internal parts are
// removed, and links to files that are not being shared become plain text.
async function page(source, file, out, name, done) {
  const key = resolve(source, file);
  if (done.has(key)) return;
  done.add(key);
  const $ = load(await readFile(key, "utf8")),
    base = dirname(file);
  $(".operator, .internal").remove();
  const local = async (ref) => {
    if (!ref || /^(https?:|mailto:|tel:|#|data:)/i.test(ref)) return null;
    const [path, hash = ""] = ref.split("#"),
      target = resolve(source, base, decodeURIComponent(path));
    if (!target.startsWith(source + sep) || !existsSync(target)) return false;
    const inside = relative(source, target);
    if (PICTURE.test(target)) {
      await mkdir(dirname(resolve(out, inside)), { recursive: true });
      await cp(target, resolve(out, inside));
      return ref;
    }
    if (/report\.html$/.test(target)) {
      await page(source, inside, out, inside, done);
      return ref + (hash && !ref.includes("#") ? "#" + hash : "");
    }
    return false;
  };
  for (const el of $("img[src]").toArray())
    if ((await local($(el).attr("src"))) === false) $(el).remove();
  for (const el of $("a[href]").toArray())
    if ((await local($(el).attr("href"))) === false)
      $(el).replaceWith($(el).text());
  await mkdir(dirname(resolve(out, name)), { recursive: true });
  await writeFile(resolve(out, name), $.html());
}

export async function share(id, { run, out } = {}) {
  const projectDir = resolve("projects", id);
  const name = await resolveRun(projectDir, run, SHAREABLE, {
    purpose: "share",
    test: (r) => !r.name.endsWith("-check"),
  });
  const found = (await listRuns(projectDir)).find((r) => r.name === name);
  if (!found?.finished || !SHAREABLE.includes(found.kind))
    throw new CliError(
      `${name} has no finished report to share`,
      `wt status ${id}   (lists the runs that exist)`,
    );
  const source = resolve(projectDir, "evidence", name),
    target = resolve(out || resolve("output", "share", `${id}-${name}`));
  // The bundle is always rebuilt from saved results, so it uses current wording.
  await renderDir(source, found.kind);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await page(source, "report.html", target, "index.html", new Set());
  const files = await readdir(target, { recursive: true });
  console.log(
    `Shared bundle: ${relative(process.cwd(), target) || target}/index.html\n${kinds[found.kind]} of ${id}, ${files.length} files. Internal evidence, conditions and operator commands are left out.\nNext: upload the folder to any static host, or zip and send it.`,
  );
  return target;
}
