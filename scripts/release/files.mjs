import {
  lstat,
  readdir,
  readFile,
  mkdir,
  writeFile,
  rename,
  chmod,
  unlink,
  open,
  realpath,
} from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
export const sha = (value) => createHash("sha256").update(value).digest("hex");
export const marker = ".web-tools-release-target.json";
export function relativePath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.length > 500 ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[\x00-\x1f\x7f]/.test(p) ||
          /^\.web-tools/.test(p),
      )
  )
    throw Error(`Invalid release path: ${path}`);
  if (
    path
      .split("/")
      .some((p) =>
        /^\.env(?:\.|$)|^\.git$|^node_modules$|^wp-config\.php$|\.(?:sql|pem|key)$/i.test(
          p,
        ),
      )
  )
    throw Error(`Sensitive or unsupported file: ${path}`);
  return path;
}
export async function safePath(root, path) {
  relativePath(path);
  const base = resolve(root);
  if ((await lstat(base)).isSymbolicLink())
    throw Error("Root must not be a symlink");
  let current = base;
  for (const part of path.split("/")) {
    current = resolve(current, part);
    try {
      const st = await lstat(current);
      if (st.isSymbolicLink()) throw Error(`Symlink refused: ${path}`);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  if (!current.startsWith(base + sep)) throw Error("Path escapes root");
  return current;
}
export async function fileState(root, path) {
  const full = await safePath(root, path);
  try {
    const s = await lstat(full);
    if (!s.isFile()) throw Error(`Expected regular file: ${path}`);
    const bytes = await readFile(full);
    return {
      exists: true,
      sha256: sha(bytes),
      bytes: bytes.length,
      mode: s.mode & 0o777,
    };
  } catch (e) {
    if (e.code === "ENOENT") return { exists: false };
    throw e;
  }
}
export async function tree(root, { target = false } = {}) {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw Error("Tree root must be a regular directory");
  const result = [];
  async function walk(path = "") {
    for (const e of await readdir(resolve(root, path), {
      withFileTypes: true,
    })) {
      if (target && e.name === marker && path === "") continue;
      const p = path ? path + "/" + e.name : e.name;
      relativePath(p);
      const full = await safePath(root, p);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile())
        result.push({ path: p, ...(await fileState(root, p)) });
      else throw Error(`Unsupported filesystem entry: ${p}`);
    }
  }
  await walk();
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
export async function atomicWrite(root, path, bytes, mode = 0o644) {
  const file = await safePath(root, path);
  await mkdir(dirname(file), { recursive: true });
  await safePath(root, path);
  const tmp = resolve(dirname(file), `.web-tools-${randomUUID()}.tmp`);
  try {
    await writeFile(tmp, bytes, { flag: "wx", mode });
    await chmod(tmp, mode);
    await rename(tmp, file);
  } finally {
    await unlink(tmp).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
export const jsonBytes = (data) =>
  Buffer.from(JSON.stringify(data, null, 2) + "\n");
export async function writeJson(file, data) {
  await writeFile(file, jsonBytes(data));
}
export async function initTarget(root, projectId) {
  await mkdir(root);
  await writeJson(resolve(root, marker), {
    version: 1,
    projectId,
    purpose: "disposable-release-rehearsal",
    id: randomUUID(),
  });
}
export async function targetIdentity(root, projectId) {
  const info = JSON.parse(await readFile(resolve(root, marker)));
  if (
    info.version !== 1 ||
    info.projectId !== projectId ||
    info.purpose !== "disposable-release-rehearsal"
  )
    throw Error("Target is not an owned rehearsal for this project");
  if ((await realpath(root)) !== resolve(root))
    throw Error("Target path must not contain symlinks");
  return info;
}
export async function lockTarget(root, work) {
  const file = resolve(root, ".web-tools-release.lock"),
    handle = await open(file, "wx");
  try {
    return await work();
  } finally {
    await handle.close();
    await unlink(file);
  }
}
export function sameState(a, b) {
  return (
    a.exists === b.exists &&
    (!a.exists || (a.sha256 === b.sha256 && a.mode === b.mode))
  );
}
