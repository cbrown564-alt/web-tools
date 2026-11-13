import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { help, parseTool } from "./cli/grammar.mjs";
import { nextRunName, resolveRun, RUN_NAME } from "./cli/runs.mjs";
import { report as reportError, CliError } from "./cli/errors.mjs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { hostname, platform, release, arch } from "node:os";
import { loadProject, projectDir } from "./project.mjs";
import { redact } from "./site-check/core.mjs";
import {
  sha,
  tree,
  atomicWrite,
  initTarget,
  writeJson,
  jsonBytes,
} from "./release/files.mjs";
import {
  packFiles,
  verifyPackage,
  snapshot,
  restoreSnapshot,
} from "./release/package.mjs";
import { applyPackage, reverseJournal } from "./release/journal.mjs";
import { checklist, checklistMarkdown } from "./release/checklist.mjs";
import { runFormRehearsal, validateFormProfile } from "./release/forms.mjs";
import { releaseReport } from "./release/report.mjs";
// Read a pin or path that an earlier run of this tool recorded, so nobody copies it by hand.
async function recorded(run) {
  return JSON.parse(
    await readFile(resolve(projectDir, "evidence", run, "results.json")),
  );
}
export async function main(args = process.argv.slice(2)) {
  const { values: o, action } = parseTool("release", args);
  if (o.help) {
    console.log(help("release"));
    return;
  }
  if (o.run && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(o.run))
    throw Error("Invalid run name");
  const project = await loadProject({ siteCheck: true });
  if (o.archive) {
    if (action !== "verify" || o.package || !/^[a-f0-9]{64}$/.test(o.sha || ""))
      throw Error(
        "Archive verification needs verify --archive <file> --sha <trusted-archive-pin>",
      );
    if (sha(await readFile(resolve(o.archive))) !== o.sha)
      throw Error("Archive SHA-256 mismatch");
    console.log(
      "Archive bytes match the pinned SHA-256. Verify the extracted folder separately before applying.",
    );
    return;
  }
  let verified, spec, source, baseline, profile;
  if (o.profile) {
    if (action !== "forms") throw Error("--profile is only for forms");
    profile = JSON.parse(await readFile(resolve(o.profile)));
    validateFormProfile(profile, project.id);
  }
  if (action === "verify" || action === "rehearse") {
    if (!o.package) {
      const run = await resolveRun(projectDir, "latest", "release-pack", {
        purpose: action,
      });
      o.package = resolve(projectDir, "evidence", run, "package");
      o.sha ||= (await recorded(run)).packageSha256;
      console.log(`Pinned manifest SHA-256 from that run: ${o.sha}`);
    }
    if (!o.sha)
      throw new CliError(
        "A package folder you name yourself needs its trusted pin",
        `Add --sha <manifest-sha256>, or leave out --package to use the latest package run`,
      );
    verified = await verifyPackage(resolve(o.package), o.sha);
    if (verified.projectId !== project.id)
      throw Error("Package belongs to another project");
    if (action === "verify") {
      console.log(
        `Verified ${verified.entries.length} pinned operations for ${project.id}`,
      );
      return;
    }
    if (!o.baseline) {
      let own = {};
      try {
        own = JSON.parse(await readFile(resolve(projectDir, "release.json")));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (!own.baseline)
        throw new CliError(
          "Rehearsal needs the files the release is applied over",
          `Add "baseline": "evidence/<run>" to projects/${project.id}/release.json, or pass --baseline <run>`,
        );
      o.baseline = resolve(projectDir, own.baseline);
      console.log(`Baseline from release.json: ${own.baseline}`);
    } else if (RUN_NAME.test(o.baseline))
      o.baseline = resolve(
        projectDir,
        "evidence",
        await resolveRun(projectDir, o.baseline, "other", { quiet: true }),
      );
    baseline = resolve(o.baseline);
    if (!baseline.startsWith(projectDir + sep))
      throw Error("Baseline must be inside the selected project");
    await tree(baseline);
  }
  if (action === "pack") {
    spec = JSON.parse(
      await readFile(resolve(o.spec || resolve(projectDir, "release.json"))),
    );
    if (spec.projectId !== project.id)
      throw Error("Specification belongs to another project");
    source = resolve(projectDir, spec.source);
    if (!source.startsWith(projectDir + sep))
      throw Error("Candidate source must be inside this project");
  }
  if (action === "reverse") {
    if (!o.journal && !o.target) {
      const run = await resolveRun(projectDir, "latest", "release-rehearse", {
        purpose: "reverse",
      });
      o.journal = resolve(projectDir, "evidence", run, "journal");
      o.target = resolve(projectDir, "evidence", run, "target");
      o.sha ||= (await recorded(run)).rehearsal.journalSha256;
      console.log(`Pinned journal SHA-256 from that run: ${o.sha}`);
    }
    if (!o.journal || !o.target || !o.sha)
      throw new CliError(
        "Reverse needs --journal, --target and --sha together",
        `Leave all three out to reverse the latest rehearsal: wt release ${project.id} reverse`,
      );
    const target = resolve(o.target);
    if (
      !target.startsWith(resolve(projectDir, "evidence") + sep) ||
      !target.endsWith(sep + "target")
    )
      throw Error(
        "Reverse only supports an owned target in this project evidence",
      );
    const j = JSON.parse(await readFile(resolve(o.journal, "journal.json")));
    if (j.projectId !== project.id)
      throw Error("Journal belongs to another project");
  }
  const run = o.run || nextRunName(projectDir, `release-${action}`),
    root = resolve(projectDir, "evidence");
  await mkdir(root, { recursive: true });
  const out = resolve(root, run);
  await mkdir(out);
  const files = await Promise.all(
    [
      "package.json",
      "package-lock.json",
      "scripts/project.mjs",
      "scripts/report.mjs",
      "scripts/release.mjs",
      ...[
        "files",
        "package",
        "journal",
        "forms",
        "form-fixture",
        "checklist",
        "report",
      ].map((n) => `scripts/release/${n}.mjs`),
    ].map(async (file) => ({ file, sha256: sha(await readFile(file)) })),
  );
  await writeJson(
    resolve(out, "conditions.json"),
    redact({
      createdAt: new Date().toISOString(),
      node: process.version,
      machine: {
        hostname: hostname(),
        platform: platform(),
        release: release(),
        arch: arch(),
      },
      collector: { sha256: sha(jsonBytes(files)), files },
      options: o,
      scope:
        "Disposable local static-file rehearsal and synthetic local form service only",
    }),
  );
  const list = checklist(project.id);
  await writeJson(resolve(out, "checklist.json"), list);
  await writeFile(resolve(out, "checklist.md"), checklistMarkdown(list));
  const data = {
    version: 1,
    tool: "release-kit",
    project: { id: project.id, name: project.name },
    run,
    action,
    startedAt: new Date().toISOString(),
    state: "running",
  };
  try {
    if (action === "pack") {
      const packed = await packFiles(source, spec, resolve(out, "package"));
      data.package = await verifyPackage(
        resolve(out, "package"),
        packed.sha256,
      );
      data.packageSha256 = packed.sha256;
      await writeFile(resolve(out, "package.sha256"), packed.sha256 + "\n");
      execFileSync("tar", [
        "-czf",
        resolve(out, "package.tar.gz"),
        "-C",
        out,
        "package",
      ]);
      data.archive = {
        sha256: sha(await readFile(resolve(out, "package.tar.gz"))),
      };
      data.state = "packaged";
      console.log(`Manifest SHA-256: ${packed.sha256}`);
    } else if (action === "rehearse") {
      data.package = verified;
      data.packageSha256 = o.sha;
      const target = resolve(out, "target");
      await initTarget(target, project.id);
      for (const f of await tree(baseline))
        await atomicWrite(
          target,
          f.path,
          await readFile(resolve(baseline, f.path)),
          f.mode,
        );
      const original = await tree(target, { target: true }),
        backup = await snapshot(target, resolve(out, "backup"));
      const restore = await restoreSnapshot(
        resolve(out, "backup"),
        backup.sha256,
        resolve(out, "restore"),
      );
      const applied = await applyPackage(
        resolve(o.package),
        o.sha,
        target,
        resolve(out, "journal"),
      );
      const incoming = `rehearsal-incoming/${randomUUID()}.txt`;
      await atomicWrite(
        target,
        incoming,
        Buffer.from(
          "SYNTHETIC record created after application; preserve during reversal.\n",
        ),
      );
      const reversal = await reverseJournal(
          resolve(out, "journal"),
          applied.sha256,
          target,
        ),
        after = await tree(target, { target: true });
      const originalsRestored =
          JSON.stringify(after.filter((f) => f.path !== incoming)) ===
          JSON.stringify(original),
        incomingPreserved = after.some((f) => f.path === incoming);
      if (!originalsRestored || !incomingPreserved)
        throw Error("Selective reversal did not preserve expected files");
      data.rehearsal = {
        restore,
        backupSha256: backup.sha256,
        journalSha256: applied.sha256,
        changed: applied.journal.entries.filter((e) => e.state === "applied")
          .length,
        unchanged: applied.journal.entries.filter(
          (e) => e.state === "unchanged",
        ).length,
        reversed: reversal.rows.every((r) =>
          ["reversed", "already-original"].includes(r.state),
        ),
        originalsRestored,
        incomingPreserved,
        incoming,
        reversalFile: `journal/${reversal.file}`,
      };
      data.state = "rehearsed";
    } else if (action === "reverse") {
      data.reversal = await reverseJournal(
        resolve(o.journal),
        o.sha,
        resolve(o.target),
        { outputDir: out },
      );
      data.state = "reversed";
    } else {
      data.forms = await runFormRehearsal(project, out, { profile });
      await writeJson(resolve(out, "form-results.json"), data.forms);
      data.state = data.forms.state;
    }
  } catch (error) {
    data.state = "failed";
    data.failure = error.message;
    if (error.journalSha256)
      data.recovery = {
        journalSha256: error.journalSha256,
        journal: "journal",
        target: "target",
      };
    process.exitCode = 2;
  }
  data.finishedAt = new Date().toISOString();
  await writeJson(resolve(out, "results.json"), redact(data));
  await releaseReport(out, data);
  console.log(`Report: ${out}/report.html\nRelease kit: ${data.state}`);
  if (data.state === "failed") process.exitCode = 2;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    reportError(error, { tool: "release", project: process.env.PROJECT });
    process.exitCode = 1;
  });
