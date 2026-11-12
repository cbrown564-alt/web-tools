import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
await stat("dist/index.html");
await mkdir("output", { recursive: true });
const target = resolve("output/web-tools-static.tar.gz");
execFileSync("tar", ["-czf", target, "-C", "dist", "."]);
console.log(`Static website packaged: ${target}`);
