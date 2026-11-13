import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  symlink,
  writeFile,
  readFile,
  rm,
  realpath,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
test("CLI packs, verifies transported archives, restores a baseline and reverses an owned target without altering old evidence", async () => {
  const repo = process.cwd(),
    tmp = await mkdtemp(join(tmpdir(), "release-cli-")),
    root = await realpath(tmp);
  try {
    for (const file of [
      "scripts",
      "src",
      "package.json",
      "package-lock.json",
      "node_modules",
    ])
      await symlink(resolve(repo, file), join(root, file));
    const project = join(root, "projects/fixture");
    await mkdir(join(project, "evidence/before"), { recursive: true });
    await mkdir(join(project, "evidence/candidate"));
    await writeFile(
      join(project, "project.json"),
      JSON.stringify({
        version: 2,
        kind: "site-check",
        id: "fixture",
        name: "Synthetic release CLI fixture",
        site: { id: "live", label: "Fixture", baseUrl: "https://example.com" },
        pages: [{ id: "home", label: "Home", path: "/" }],
        devices: { desktop: { width: 900, height: 700 } },
      }),
    );
    await writeFile(
      join(project, "evidence/before/index.html"),
      "<h1>Old static fixture</h1>",
    );
    await writeFile(
      join(project, "evidence/before/unselected.txt"),
      "Preserve me",
    );
    await writeFile(
      join(project, "evidence/candidate/index.html"),
      "<h1>New static fixture</h1>",
    );
    await writeFile(
      join(project, "evidence/candidate/new.css"),
      "body{color:#171717}",
    );
    await writeFile(
      join(project, "release.json"),
      JSON.stringify({
        version: 1,
        projectId: "fixture",
        platform: "static-files",
        source: "evidence/candidate",
        files: ["index.html", "new.css"],
        delete: [],
      }),
    );
    async function run(args) {
      return new Promise((done, reject) => {
        const child = spawn(
          process.execPath,
          [resolve(repo, "scripts/release.mjs"), ...args],
          { cwd: root, env: { ...process.env, PROJECT: "fixture" } },
        );
        let output = "";
        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("error", reject);
        child.on("close", (code) => done({ code, output }));
      });
    }
    let result = await run(["pack", "--run", "package"]);
    assert.equal(result.code, 0, result.output);
    const packed = JSON.parse(
        await readFile(join(project, "evidence/package/results.json")),
      ),
      pin = packed.packageSha256;
    result = await run([
      "verify",
      "--archive",
      join(project, "evidence/package/package.tar.gz"),
      "--sha",
      packed.archive.sha256,
    ]);
    assert.equal(result.code, 0, result.output);
    result = await run([
      "verify",
      "--archive",
      join(project, "evidence/package/package.tar.gz"),
      "--sha",
      "0".repeat(64),
    ]);
    assert.equal(result.code, 1);
    await mkdir(join(root, "transported"));
    execFileSync("tar", [
      "-xzf",
      join(project, "evidence/package/package.tar.gz"),
      "-C",
      join(root, "transported"),
    ]);
    result = await run([
      "verify",
      "--package",
      join(root, "transported/package"),
      "--sha",
      pin,
    ]);
    assert.equal(result.code, 0, result.output);
    result = await run([
      "verify",
      "--package",
      join(root, "transported/package"),
      "--sha",
      "0".repeat(64),
    ]);
    assert.equal(result.code, 1);
    result = await run([
      "rehearse",
      "--package",
      join(root, "transported/package"),
      "--sha",
      pin,
      "--baseline",
      join(project, "evidence/before"),
      "--run",
      "rehearsal",
    ]);
    assert.equal(result.code, 0, result.output);
    const report = JSON.parse(
      await readFile(join(project, "evidence/rehearsal/results.json")),
    );
    assert.equal(report.rehearsal.restore.verified, true);
    assert.equal(report.rehearsal.incomingPreserved, true);
    assert.equal(report.rehearsal.originalsRestored, true);
    assert.equal(
      await readFile(
        join(project, "evidence/rehearsal/target/index.html"),
        "utf8",
      ),
      "<h1>Old static fixture</h1>",
    );
    const originalReverse = await readFile(
      join(project, "evidence/rehearsal", report.rehearsal.reversalFile),
    );
    result = await run([
      "reverse",
      "--journal",
      join(project, "evidence/rehearsal/journal"),
      "--sha",
      report.rehearsal.journalSha256,
      "--target",
      join(project, "evidence/rehearsal/target"),
      "--run",
      "reverse-again",
    ]);
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(
      await readFile(
        join(project, "evidence/rehearsal", report.rehearsal.reversalFile),
      ),
      originalReverse,
    );
    const check = JSON.parse(
      await readFile(join(project, "evidence/reverse-again/results.json")),
    );
    assert.equal(check.state, "reversed");
    assert.equal(check.reversal.rows.length, 2);
    await stat(join(project, "evidence/reverse-again", check.reversal.file));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
