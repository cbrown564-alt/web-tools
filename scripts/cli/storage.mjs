import {
  readFile,
  readdir,
  rm,
  mkdir,
  writeFile,
  stat,
  link,
  unlink,
  rename,
} from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { CliError } from "./errors.mjs";
import { listRuns, kinds } from "./runs.mjs";
import { writeIndex, stateWord } from "./status.mjs";

const size = (kb) =>
  kb >= 1048576
    ? `${(kb / 1048576).toFixed(1)} GB`
    : kb >= 1024
      ? `${Math.round(kb / 1024)} MB`
      : `${kb} KB`;
const du = (path) =>
  Number(
    execFileSync("du", ["-sk", path], { encoding: "utf8" }).split("\t")[0],
  );

async function confirm(question, yes) {
  if (yes) return true;
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} Type yes to continue: `);
  rl.close();
  return answer.trim().toLowerCase() === "yes";
}

// Which runs something still depends on, and why.
export async function prunePlan(id) {
  const dir = resolve("projects", id),
    runs = await listRuns(dir),
    names = new Set(runs.map((r) => r.name)),
    keep = new Map();
  const protect = (name, reason) => {
    if (names.has(name) && !keep.has(name)) keep.set(name, reason);
  };
  for (const r of runs)
    if (r.kind === "other") protect(r.name, "not a recognised run; left alone");
    else if (!r.finished)
      protect(r.name, "did not finish; inspect before removing");
  const seen = new Set();
  for (const r of runs) {
    const key = `${r.kind}/${r.tier || ""}/${r.site || ""}`;
    if (r.finished && r.kind !== "other" && !seen.has(key)) {
      seen.add(key);
      protect(
        r.name,
        `latest ${kinds[r.kind].toLowerCase()}${r.site ? ` for ${r.site}` : ""}`,
      );
    }
  }
  for (const folder of ["watch", "inventory"])
    try {
      for (const file of await readdir(resolve(dir, folder))) {
        const p = JSON.parse(await readFile(resolve(dir, folder, file)));
        protect(
          p.run,
          folder === "watch"
            ? `accepted watch baseline for ${p.site}`
            : `current inventory for ${p.site}`,
        );
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  let cited = "";
  for (const file of [
    "README.md",
    ...(await readdir("docs", { recursive: true }).catch(() => [])).map(
      (f) => `docs/${f}`,
    ),
  ])
    if (file.endsWith(".md"))
      cited += await readFile(file, "utf8").catch(() => "");
  let own = "";
  for (const file of ["project.json", "release.json", "maximum.json"])
    try {
      own += await readFile(resolve(dir, file), "utf8");
    } catch {}
  const mentioned = (text, name) =>
    new RegExp(`(^|[^a-z0-9-])${name}([^a-z0-9-]|$)`).test(text);
  for (const r of runs) {
    if (mentioned(cited, r.name))
      protect(r.name, "cited in a verification record");
    if (mentioned(own, r.name))
      protect(r.name, "named in the project's own files");
  }
  // Anything a kept run was built from is kept too.
  for (let changed = true; changed;) {
    changed = false;
    for (const r of runs)
      if (keep.has(r.name))
        for (const ref of [...(r.refs || []), `${r.name}-check`])
          if (names.has(ref) && !keep.has(ref)) {
            keep.set(ref, `used by ${r.name}`);
            changed = true;
          }
  }
  const rows = runs.map((r) => ({
    ...r,
    kb: du(resolve(dir, "evidence", r.name)),
    reason: keep.get(r.name),
  }));
  return {
    dir,
    rows,
    remove: rows.filter((r) => !r.reason),
    kept: rows.filter((r) => r.reason),
  };
}

const hashFile = (file) =>
  new Promise((done, fail) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("end", () => done(h.digest("hex")))
      .on("error", fail);
  });
// Release rehearsals keep several identical copies of the same payload.
// Find them, so one copy can be stored and the rest linked to it.
export async function duplicatePlan(dir, skip = new Set()) {
  const root = resolve(dir, "evidence"),
    bySize = new Map();
  let entries = [];
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const e of entries) {
    if (!e.isFile() || /\.(html|json|jsonl|md)$/.test(e.name)) continue;
    const file = resolve(e.parentPath, e.name);
    if (skip.has(relative(root, file).split("/")[0])) continue;
    const s = await stat(file);
    if (s.size < 16_384) continue;
    const key = `${s.size}/${s.mode}`;
    bySize.set(key, [
      ...(bySize.get(key) || []),
      { file, ino: s.ino, size: s.size },
    ]);
  }
  const groups = [];
  for (const files of bySize.values()) {
    if (new Set(files.map((f) => f.ino)).size < 2) continue;
    const byHash = new Map();
    for (const f of files) {
      const h = await hashFile(f.file);
      byHash.set(h, [...(byHash.get(h) || []), f]);
    }
    for (const same of byHash.values()) {
      const inodes = new Set(same.map((f) => f.ino));
      if (inodes.size > 1)
        groups.push({
          files: same,
          saveKb: Math.round(((inodes.size - 1) * same[0].size) / 1024),
        });
    }
  }
  return {
    groups,
    saveKb: groups.reduce((n, g) => n + g.saveKb, 0),
    files: groups.reduce(
      (n, g) => n + new Set(g.files.map((f) => f.ino)).size - 1,
      0,
    ),
  };
}

export async function prune(id, { yes } = {}) {
  const plan = await prunePlan(id);
  const total = plan.rows.reduce((n, r) => n + r.kb, 0),
    free = plan.remove.reduce((n, r) => n + r.kb, 0);
  console.log(`${id}: ${plan.rows.length} runs, ${size(total)}\n`);
  if (plan.remove.length) {
    console.log(
      `Nothing depends on these ${plan.remove.length} runs (${size(free)}):`,
    );
    for (const r of plan.remove)
      console.log(
        `  ${size(r.kb).padStart(8)}  ${r.name}  (${kinds[r.kind].toLowerCase()}, ${stateWord(r)})`,
      );
  } else console.log("Every run is still depended on; none can be removed.");
  console.log(`\nKept: ${plan.kept.length} runs (${size(total - free)})`);
  for (const r of plan.kept)
    console.log(`  ${size(r.kb).padStart(8)}  ${r.name}  — ${r.reason}`);
  const dupes = await duplicatePlan(
    plan.dir,
    new Set(plan.remove.map((r) => r.name)),
  );
  if (dupes.files)
    console.log(
      `\n${dupes.files} large files in the kept runs are exact copies of another kept file. Storing each once frees ${size(dupes.saveKb)}; every path keeps working.`,
    );
  if (!plan.remove.length && !dupes.files) return;
  console.log(`\nAfter pruning: about ${size(total - free - dupes.saveKb)}.`);
  if (
    !(await confirm(
      `Remove ${plan.remove.length} runs and store ${dupes.files} duplicate files once? Removal cannot be undone.`,
      yes,
    ))
  ) {
    console.log(
      `Nothing was changed.\nNext: wt prune ${id} --yes   (to do it)   or   wt archive ${id}   (to back up first)`,
    );
    return;
  }
  for (const r of plan.remove)
    await rm(resolve(plan.dir, "evidence", r.name), { recursive: true });
  for (const g of dupes.groups) {
    const [first, ...rest] = g.files;
    for (const f of rest) {
      if (f.ino === first.ino) continue;
      // Link beside the original first, then swap, so a failure never loses the file.
      const tmp = `${f.file}.wt-link`;
      await link(first.file, tmp);
      try {
        await rename(tmp, f.file);
      } catch (error) {
        await unlink(tmp).catch(() => {});
        throw error;
      }
    }
  }
  await writeIndex(id);
  console.log(
    `Removed ${plan.remove.length} runs. ${id} now uses ${size(du(resolve(plan.dir, "evidence")))}.`,
  );
}

export async function archive(id, { out } = {}) {
  const folder = resolve(out || "output/archives");
  await mkdir(folder, { recursive: true });
  const file = resolve(
    folder,
    `${id}-${new Date().toISOString().slice(0, 10)}.tar.gz`,
  );
  if (existsSync(file))
    throw new CliError(
      `${relative(process.cwd(), file)} already exists`,
      "Move or rename it, or choose another folder with --out",
    );
  console.log(
    `Archiving projects/${id} (${size(du(resolve("projects", id)))}) ...`,
  );
  execFileSync("tar", [
    "-czf",
    file,
    "--exclude",
    `${id}/index.html`,
    "--exclude",
    `${id}/.runs-cache.json`,
    "-C",
    "projects",
    id,
  ]);
  const sha = await hashFile(file);
  await writeFile(`${file}.sha256`, `${sha}  ${file.split("/").pop()}\n`);
  console.log(
    `Archive: ${relative(process.cwd(), file)} (${size(du(file))})\nSHA-256: ${sha}\nIt holds the project record, pointers and every saved run. Keep it somewhere other than this disk.\nNext: wt restore --from <that file>   (in a clean checkout, to prove it restores)`,
  );
}

export async function restore({ from } = {}) {
  if (!from)
    throw new CliError(
      "Restore needs the archive file",
      "wt restore --from output/archives/<project>-<date>.tar.gz",
    );
  const file = resolve(process.env.INIT_CWD || process.cwd(), from);
  if (!existsSync(file))
    throw new CliError(
      `No archive at ${from}`,
      "Check the path; wt archive <project> writes to output/archives/",
    );
  const listing = execFileSync("tar", ["-tzf", file], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  })
    .split("\n")
    .filter(Boolean);
  const ids = new Set(listing.map((l) => l.split("/")[0]));
  if (
    ids.size !== 1 ||
    listing.some((l) => l.startsWith("/") || l.split("/").includes(".."))
  )
    throw new CliError(
      "This is not an archive written by wt archive",
      "wt archive <project>",
    );
  const [id] = ids;
  if (existsSync(resolve("projects", id)))
    throw new CliError(
      `projects/${id} already exists here; restore never overwrites`,
      "Restore in a clean checkout, or move the existing folder aside first",
    );
  await mkdir("projects", { recursive: true });
  execFileSync("tar", ["-xzf", file, "-C", "projects"]);
  const { rerenderAll } = await import("./render.mjs");
  const result = await rerenderAll(id);
  await writeIndex(id);
  console.log(
    `Restored projects/${id}: ${result.runs} runs, ${result.rebuilt} reports rebuilt offline${result.failed.length ? `, ${result.failed.length} could not be rebuilt:\n  ${result.failed.join("\n  ")}` : ""}.\nNext: wt status ${id}`,
  );
  if (result.failed.length) process.exitCode = 2;
}
