import { readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { verifyPackage } from "./package.mjs";
import {
  sha,
  jsonBytes,
  fileState,
  sameState,
  targetIdentity,
  lockTarget,
  safePath,
  atomicWrite,
} from "./files.mjs";
export async function applyPackage(
  root,
  pin,
  target,
  journalDir,
  { afterWrite } = {},
) {
  const m = await verifyPackage(root, pin),
    identity = await targetIdentity(target, m.projectId);
  await mkdir(journalDir);
  await mkdir(resolve(journalDir, "before"));
  const journal = {
    version: 1,
    tool: "release-journal",
    projectId: m.projectId,
    packageSha256: pin,
    targetId: identity.id,
    startedAt: new Date().toISOString(),
    state: "applying",
    entries: [],
  };
  const file = resolve(journalDir, "journal.json");
  const save = () =>
    atomicWrite(journalDir, "journal.json", jsonBytes(journal));
  return lockTarget(target, async () => {
    try {
      const planned = [];
      for (const e of m.entries) {
        const before = await fileState(target, e.path);
        planned.push({
          ...e,
          before,
          after:
            e.operation === "write"
              ? { exists: true, sha256: e.sha256, bytes: e.bytes, mode: e.mode }
              : { exists: false },
        });
      }
      await save();
      for (const entry of planned) {
        if (!sameState(await fileState(target, entry.path), entry.before))
          throw Error(`Target changed since preflight: ${entry.path}`);
        if (sameState(entry.before, entry.after)) {
          journal.entries.push({ ...entry, state: "unchanged" });
          await save();
          continue;
        }
        if (entry.before.exists) {
          entry.beforeFile = `before/${journal.entries.length}.bin`;
          const bytes = await readFile(await safePath(target, entry.path));
          if (sha(bytes) !== entry.before.sha256)
            throw Error("Target changed while journalling");
          await writeFile(resolve(journalDir, entry.beforeFile), bytes, {
            flag: "wx",
          });
        }
        journal.entries.push({
          ...entry,
          state: "prepared",
          preparedAt: new Date().toISOString(),
        });
        await save();
        if (entry.operation === "write") {
          const payload = await readFile(
            await safePath(resolve(root, "payload"), entry.path),
          );
          if (sha(payload) !== entry.sha256 || payload.length !== entry.bytes)
            throw Error("Payload changed after verification");
          await atomicWrite(target, entry.path, payload, entry.mode);
        } else if (entry.before.exists)
          await unlink(await safePath(target, entry.path));
        if (!sameState(await fileState(target, entry.path), entry.after))
          throw Error("Applied file verification failed");
        await afterWrite?.(entry, journal.entries.length);
        journal.entries.at(-1).state = "applied";
        journal.entries.at(-1).appliedAt = new Date().toISOString();
        await save();
      }
      journal.state = "applied";
      journal.finishedAt = new Date().toISOString();
      await save();
      return { journal, sha256: sha(await readFile(file)) };
    } catch (error) {
      journal.state = "failed";
      journal.error = error.message;
      await save();
      error.journalSha256 = sha(await readFile(file));
      throw error;
    }
  });
}
export async function reverseJournal(
  journalDir,
  pin,
  target,
  { outputDir = journalDir } = {},
) {
  const bytes = await readFile(await safePath(journalDir, "journal.json"));
  if (sha(bytes) !== pin) throw Error("Journal manifest hash mismatch");
  const journal = JSON.parse(bytes);
  if (
    journal.version !== 1 ||
    journal.tool !== "release-journal" ||
    !["applied", "failed"].includes(journal.state)
  )
    throw Error("Journal is not reversible");
  const identity = await targetIdentity(target, journal.projectId);
  if (identity.id !== journal.targetId)
    throw Error("Journal belongs to a different target");
  return lockTarget(target, async () => {
    const changes = journal.entries.filter((e) => e.state !== "unchanged"),
      conflicts = [];
    for (const e of changes) {
      const current = await fileState(target, e.path);
      if (!sameState(current, e.before) && !sameState(current, e.after))
        conflicts.push(e.path);
      if (e.before.exists) {
        if (!/^before\/\d+\.bin$/.test(e.beforeFile || ""))
          throw Error("Invalid journal blob path");
        if (
          sha(await readFile(await safePath(journalDir, e.beforeFile))) !==
          e.before.sha256
        )
          throw Error("Journal backup blob mismatch");
      }
    }
    if (conflicts.length)
      throw Error(
        `Reversal conflicts; no files changed: ${conflicts.join(", ")}`,
      );
    const result = {
      version: 1,
      tool: "release-reversal",
      projectId: journal.projectId,
      targetId: journal.targetId,
      file: `reversal-${randomUUID()}.json`,
      journalSha256: pin,
      startedAt: new Date().toISOString(),
      rows: [],
    };
    for (const e of [...changes].reverse()) {
      const current = await fileState(target, e.path);
      if (sameState(current, e.before)) {
        result.rows.push({ path: e.path, state: "already-original" });
        continue;
      }
      if (!sameState(current, e.after))
        throw Error(`Target changed during reversal: ${e.path}`);
      if (e.before.exists)
        await atomicWrite(
          target,
          e.path,
          await readFile(await safePath(journalDir, e.beforeFile)),
          e.before.mode,
        );
      else await unlink(await safePath(target, e.path));
      if (!sameState(await fileState(target, e.path), e.before))
        throw Error("Reversal verification failed");
      result.rows.push({ path: e.path, state: "reversed" });
    }
    result.finishedAt = new Date().toISOString();
    await writeFile(resolve(outputDir, result.file), jsonBytes(result), {
      flag: "wx",
    });
    return result;
  });
}
