import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  relativePath,
  safePath,
  fileState,
  tree,
  sha,
  jsonBytes,
  atomicWrite,
} from "./files.mjs";
export async function packFiles(source, spec, destination) {
  if (
    spec.version !== 1 ||
    spec.platform !== "static-files" ||
    !spec.projectId ||
    !Array.isArray(spec.files) ||
    !spec.files.length
  )
    throw Error(
      "Expected a static-files release specification with an explicit file list",
    );
  const seen = new Set(),
    entries = [];
  for (const path of [...spec.files, ...(spec.delete || [])]) {
    relativePath(path);
    const key = path.toLowerCase();
    if (seen.has(key)) throw Error("Duplicate or case-colliding release path");
    seen.add(key);
  }
  for (const path of spec.files) {
    const state = await fileState(source, path);
    if (!state.exists) throw Error(`Missing candidate file: ${path}`);
    entries.push({
      path,
      operation: "write",
      sha256: state.sha256,
      bytes: state.bytes,
      mode: state.mode,
    });
  }
  for (const path of spec.delete || [])
    entries.push({ path, operation: "delete" });
  entries.sort((a, b) => a.path.localeCompare(b.path));
  await mkdir(destination);
  await mkdir(resolve(destination, "payload"));
  for (const e of entries.filter((e) => e.operation === "write")) {
    const bytes = await readFile(await safePath(source, e.path));
    if (sha(bytes) !== e.sha256)
      throw Error("Candidate changed while packaging");
    await atomicWrite(resolve(destination, "payload"), e.path, bytes, e.mode);
  }
  const manifest = {
    version: 1,
    tool: "release-package",
    projectId: spec.projectId,
    platform: spec.platform,
    createdAt: new Date().toISOString(),
    entries,
  };
  const bytes = jsonBytes(manifest);
  await writeFile(resolve(destination, "manifest.json"), bytes, { flag: "wx" });
  return { manifest, sha256: sha(bytes) };
}
export async function verifyPackage(root, expected) {
  if (!/^[a-f0-9]{64}$/.test(expected || ""))
    throw Error("Supply the pinned manifest SHA-256");
  const bytes = await readFile(await safePath(root, "manifest.json"));
  if (sha(bytes) !== expected) throw Error("Package manifest hash mismatch");
  const manifest = JSON.parse(bytes);
  if (
    manifest.version !== 1 ||
    manifest.tool !== "release-package" ||
    manifest.platform !== "static-files" ||
    !Array.isArray(manifest.entries) ||
    !manifest.entries.length
  )
    throw Error("Invalid release manifest");
  const seen = new Set();
  for (const e of manifest.entries) {
    relativePath(e.path);
    if (seen.has(e.path.toLowerCase())) throw Error("Duplicate package entry");
    seen.add(e.path.toLowerCase());
    if (!["write", "delete"].includes(e.operation))
      throw Error("Invalid operation");
    if (e.operation === "write") {
      if (
        !Number.isInteger(e.mode) ||
        e.mode < 0 ||
        e.mode > 0o777 ||
        !Number.isInteger(e.bytes) ||
        !/^[a-f0-9]{64}$/.test(e.sha256 || "")
      )
        throw Error("Invalid file metadata");
      const actual = await fileState(resolve(root, "payload"), e.path);
      if (
        !actual.exists ||
        actual.sha256 !== e.sha256 ||
        actual.bytes !== e.bytes ||
        actual.mode !== e.mode
      )
        throw Error(`Payload mismatch: ${e.path}`);
    }
  }
  const actual = await tree(resolve(root, "payload"));
  const expectedPaths = manifest.entries
    .filter((e) => e.operation === "write")
    .map((e) => e.path)
    .sort();
  if (
    JSON.stringify(actual.map((e) => e.path).sort()) !==
    JSON.stringify(expectedPaths)
  )
    throw Error("Unlisted or missing payload files");
  const top = await readdir(root);
  if (
    JSON.stringify(top.sort()) !== JSON.stringify(["manifest.json", "payload"])
  )
    throw Error("Unlisted package files");
  return manifest;
}
export async function snapshot(root, destination) {
  const entries = await tree(root, { target: true });
  await mkdir(destination);
  await mkdir(resolve(destination, "payload"));
  for (const e of entries)
    await atomicWrite(
      resolve(destination, "payload"),
      e.path,
      await readFile(await safePath(root, e.path)),
      e.mode,
    );
  const manifest = {
    version: 1,
    tool: "file-backup",
    createdAt: new Date().toISOString(),
    entries,
  };
  const bytes = jsonBytes(manifest);
  await writeFile(resolve(destination, "manifest.json"), bytes);
  return { manifest, sha256: sha(bytes) };
}
export async function restoreSnapshot(backup, expected, destination) {
  const bytes = await readFile(await safePath(backup, "manifest.json"));
  if (sha(bytes) !== expected) throw Error("Backup manifest hash mismatch");
  const m = JSON.parse(bytes);
  if (m.version !== 1 || m.tool !== "file-backup" || !Array.isArray(m.entries))
    throw Error("Invalid backup");
  const actual = await tree(resolve(backup, "payload"));
  if (JSON.stringify(actual) !== JSON.stringify(m.entries))
    throw Error("Backup payload mismatch");
  await mkdir(destination);
  for (const e of m.entries)
    await atomicWrite(
      destination,
      e.path,
      await readFile(await safePath(resolve(backup, "payload"), e.path)),
      e.mode,
    );
  const restored = await tree(destination);
  if (JSON.stringify(restored) !== JSON.stringify(m.entries))
    throw Error("Restored file tree does not match backup");
  return {
    verified: true,
    files: restored.length,
    sha256: sha(jsonBytes(restored)),
  };
}
