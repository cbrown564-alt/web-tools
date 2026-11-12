import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
await stat("dist/index.html");
await mkdir("output", { recursive: true });
// Name the archive after the project actually in dist/, not the environment.
const { id } = JSON.parse(await readFile("dist/project.json", "utf8"));
const target = resolve(`output/${id}-review-static.tar.gz`);
execFileSync("tar", ["-czf", target, "-C", "dist", "."]);
console.log(`Static website packaged: ${target}`);
