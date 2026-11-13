import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  chmod,
  symlink,
  realpath,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  packFiles,
  verifyPackage,
  snapshot,
  restoreSnapshot,
} from "../scripts/release/package.mjs";
import {
  initTarget,
  atomicWrite,
  tree,
  sha,
  fileState,
} from "../scripts/release/files.mjs";
import { applyPackage, reverseJournal } from "../scripts/release/journal.mjs";
async function setup(fn) {
  const temp = await mkdtemp(join(tmpdir(), "release-")),
    dir = await realpath(temp);
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const spec = {
  version: 1,
  projectId: "fixture",
  platform: "static-files",
  files: ["a.txt", "new/c.txt"],
  delete: ["obsolete.txt"],
};
async function candidate(dir) {
  const source = join(dir, "source");
  await mkdir(source);
  await atomicWrite(source, "a.txt", Buffer.from("new a"));
  await atomicWrite(source, "new/c.txt", Buffer.from("new c"));
  return packFiles(source, spec, join(dir, "package"));
}
test("fixed packages reject traversal, secrets, symlinks, extra files and changed bytes or seals", () =>
  setup(async (dir) => {
    const packed = await candidate(dir),
      root = join(dir, "package");
    assert.equal((await verifyPackage(root, packed.sha256)).entries.length, 3);
    await assert.rejects(verifyPackage(root, "0".repeat(64)), /hash mismatch/);
    await writeFile(join(root, "payload/extra.txt"), "unexpected");
    await assert.rejects(verifyPackage(root, packed.sha256), /Unlisted/);
    await rm(join(root, "payload/extra.txt"));
    await writeFile(join(root, "payload/a.txt"), "tampered");
    await assert.rejects(verifyPackage(root, packed.sha256), /mismatch/);
    for (const file of [
      "../escape",
      "/absolute",
      ".env",
      "wp-config.php",
      "a/../../escape",
    ])
      await assert.rejects(
        packFiles(
          join(dir, "source"),
          { ...spec, files: [file], delete: [] },
          join(dir, "unsafe-" + sha(file).slice(0, 5)),
        ),
      );
    await symlink(join(dir, "source/a.txt"), join(dir, "source/link"));
    await assert.rejects(
      packFiles(
        join(dir, "source"),
        { ...spec, files: ["link"], delete: [] },
        join(dir, "linked"),
      ),
      /Symlink/,
    );
  }));
test("backup restores every file and mode into a new copy, and rejects tampering before restoring", () =>
  setup(async (dir) => {
    const source = join(dir, "site");
    await mkdir(source);
    await atomicWrite(source, "a.txt", Buffer.from("old"), 0o640);
    await atomicWrite(source, "nested/other.txt", Buffer.from("preserve"));
    const original = await tree(source),
      backup = await snapshot(source, join(dir, "backup"));
    assert.equal(
      (
        await restoreSnapshot(
          join(dir, "backup"),
          backup.sha256,
          join(dir, "restored"),
        )
      ).verified,
      true,
    );
    assert.deepEqual(await tree(join(dir, "restored")), original);
    await writeFile(join(dir, "backup/payload/a.txt"), "broken");
    await assert.rejects(
      restoreSnapshot(
        join(dir, "backup"),
        backup.sha256,
        join(dir, "bad-restore"),
      ),
      /payload mismatch/,
    );
  }));
test("selective apply/reversal preserves unrelated new files, detects drift, and supports idempotent reversal", () =>
  setup(async (dir) => {
    const packed = await candidate(dir),
      target = join(dir, "target");
    await initTarget(target, "fixture");
    await atomicWrite(target, "a.txt", Buffer.from("original a"), 0o640);
    await atomicWrite(target, "obsolete.txt", Buffer.from("original obsolete"));
    await atomicWrite(target, "untouched.txt", Buffer.from("untouched"));
    const applied = await applyPackage(
      join(dir, "package"),
      packed.sha256,
      target,
      join(dir, "journal"),
    );
    assert.equal((await fileState(target, "obsolete.txt")).exists, false);
    await atomicWrite(
      target,
      "incoming/message.txt",
      Buffer.from("new enquiry"),
    );
    await atomicWrite(target, "a.txt", Buffer.from("concurrent edit"));
    await assert.rejects(
      reverseJournal(join(dir, "journal"), applied.sha256, target),
      /conflicts/,
    );
    assert.equal((await fileState(target, "new/c.txt")).exists, true);
    await atomicWrite(target, "a.txt", Buffer.from("new a"));
    await reverseJournal(join(dir, "journal"), applied.sha256, target);
    assert.equal(await readFile(join(target, "a.txt"), "utf8"), "original a");
    assert.equal((await fileState(target, "a.txt")).mode, 0o640);
    assert.equal(
      await readFile(join(target, "obsolete.txt"), "utf8"),
      "original obsolete",
    );
    assert.equal((await fileState(target, "new/c.txt")).exists, false);
    assert.equal(
      await readFile(join(target, "incoming/message.txt"), "utf8"),
      "new enquiry",
    );
    await reverseJournal(join(dir, "journal"), applied.sha256, target);
  }));
test("an interrupted write remains reversible and later changes are not overwritten", () =>
  setup(async (dir) => {
    const packed = await candidate(dir),
      target = join(dir, "target");
    await initTarget(target, "fixture");
    await atomicWrite(target, "a.txt", Buffer.from("old a"));
    let pin;
    try {
      await applyPackage(
        join(dir, "package"),
        packed.sha256,
        target,
        join(dir, "journal"),
        {
          afterWrite: () => {
            throw Error("Injected interruption");
          },
        },
      );
    } catch (e) {
      assert.match(e.message, /interruption/);
      pin = e.journalSha256;
    }
    assert.ok(pin);
    assert.equal(await readFile(join(target, "a.txt"), "utf8"), "new a");
    const journal = JSON.parse(
        await readFile(join(dir, "journal/journal.json")),
      ),
      blob = join(dir, "journal", journal.entries[0].beforeFile),
      old = await readFile(blob);
    await writeFile(blob, "tamper");
    await assert.rejects(
      reverseJournal(join(dir, "journal"), pin, target),
      /blob mismatch/,
    );
    await writeFile(blob, old);
    await reverseJournal(join(dir, "journal"), pin, target);
    assert.equal(await readFile(join(target, "a.txt"), "utf8"), "old a");
  }));
