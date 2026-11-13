import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tools, vocabulary, help } from "../scripts/cli/grammar.mjs";

const root = resolve(import.meta.dirname, "..");
function wt(cwd, args, env = {}) {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [join(root, "scripts/wt.mjs"), ...args],
      {
        env: {
          ...process.env,
          WT_ROOT: cwd,
          PROJECT: "",
          PAGESPEED_INSIGHTS_API_KEY: "",
          WT_DEBUG: "",
          ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.once("error", fail);
    child.once("close", (code) => done({ code, output }));
  });
}
async function fixtureRoot() {
  const dir = await mkdtemp(join(tmpdir(), "wt-cli-"));
  await mkdir(join(dir, "projects/fixture"), { recursive: true });
  await writeFile(
    join(dir, "projects/fixture/project.json"),
    JSON.stringify({
      version: 2,
      kind: "site-check",
      id: "fixture",
      name: "Fixture",
      site: { id: "live", label: "Live", baseUrl: "https://example.com" },
      pages: [{ id: "home", label: "Home", path: "/" }],
      devices: { desktop: { width: 900, height: 700 } },
    }),
  );
  return dir;
}
// A failure a person can act on: a cause, a next step, and no stack trace.
function actionable(result, label) {
  assert.equal(
    result.code,
    1,
    `${label}: exit ${result.code}\n${result.output}`,
  );
  assert.match(
    result.output,
    /^wt[^\n]*: \S/m,
    `${label}: no cause\n${result.output}`,
  );
  assert.match(
    result.output,
    /^Next: \S/m,
    `${label}: no next step\n${result.output}`,
  );
  assert.ok(
    !/^\s+at .+:\d+:\d+\)?$/m.test(result.output) &&
      !/node:internal|file:\/\//.test(result.output),
    `${label}: stack trace shown\n${result.output}`,
  );
}

test("the option table has one meaning per name and no synonyms", () => {
  const names = Object.keys(vocabulary);
  assert.equal(new Set(names).size, names.length);
  for (const [tool, spec] of Object.entries(tools))
    for (const option of spec.options)
      assert.ok(vocabulary[option], `${tool} uses undefined option ${option}`);
  // Singular and plural forms of one idea must not both exist.
  for (const name of names)
    assert.ok(
      !names.includes(name + "s") || ["page", "device"].includes(name),
      `${name} and ${name}s are synonyms`,
    );
  for (const synonym of [
    "sites",
    "page",
    "device",
    "id",
    "project",
    "name-run",
  ])
    assert.ok(!names.includes(synonym), synonym);
  const meanings = names.map((n) => vocabulary[n][1]);
  assert.equal(new Set(meanings).size, meanings.length);
});

test("wt and every tool's --help work without a project and exit 0", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wt-empty-"));
  try {
    const top = await wt(dir, []);
    assert.equal(top.code, 0);
    for (const tool of Object.keys(tools)) assert.ok(top.output.includes(tool));
    const results = await Promise.all(
      Object.keys(tools).map((tool) => wt(dir, [tool, "--help"])),
    );
    for (const [i, tool] of Object.keys(tools).entries()) {
      assert.equal(results[i].code, 0, tool);
      assert.equal(results[i].output.trim(), help(tool));
      assert.match(results[i].output, /Exit codes:/);
    }
    const listed = await wt(dir, ["projects"]);
    assert.equal(listed.code, 0);
    const status = await wt(dir, ["status"]);
    assert.equal(status.code, 0);
    assert.match(status.output, /Next: wt new/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("every tool turns a missing project, unknown option or missing file into a next step", async () => {
  const dir = await fixtureRoot();
  try {
    const cases = [["no such tool", ["site-chek", "fixture"]]];
    for (const [tool, spec] of Object.entries(tools)) {
      if (!spec.noProject && !spec.projectOptional && !spec.newProject) {
        cases.push([`${tool}: missing project`, [tool]]);
        cases.push([`${tool}: unknown project`, [tool, "fixtur"]]);
      }
      cases.push([
        `${tool}: unknown option`,
        spec.noProject ? [tool, "--bogus"] : [tool, "fixture", "--bogus"],
      ]);
    }
    cases.push(
      ["status: unknown project", ["status", "fixtur"]],
      ["site-check: synonym", ["site-check", "fixture", "--sites", "live"]],
      ["site-check: no run to render", ["site-check", "fixture", "--render"]],
      [
        "site-check: missing profile",
        ["site-check", "fixture", "--tier", "maximum"],
      ],
      [
        "site-check: named module without key",
        ["site-check", "fixture", "--modules", "performance"],
      ],
      [
        "site-check: unknown page",
        ["site-check", "fixture", "--pages", "nope"],
      ],
      ["watch: no key", ["watch", "fixture"]],
      ["watch: nothing to accept", ["watch", "fixture", "accept"]],
      ["watch: no run to render", ["watch", "fixture", "--render"]],
      ["watch: unknown action", ["watch", "fixture", "aceppt"]],
      ["inventory: no run to render", ["inventory", "fixture", "--render"]],
      [
        "inventory: named run missing",
        ["inventory", "fixture", "--render", "2026-01-01-inventory-01"],
      ],
      ["content: no inventory", ["content", "fixture"]],
      ["content: check without a map", ["content", "fixture", "check"]],
      [
        "content: missing map file",
        ["content", "fixture", "check", "--map", "missing.json"],
      ],
      ["release: no release.json", ["release", "fixture", "pack"]],
      ["release: nothing to verify", ["release", "fixture", "verify"]],
      ["release: nothing to rehearse", ["release", "fixture", "rehearse"]],
      ["release: nothing to reverse", ["release", "fixture", "reverse"]],
      ["release: no forms profile", ["release", "fixture", "forms"]],
      ["capture: live record", ["capture", "fixture"]],
      ["share: no runs", ["share", "fixture"]],
      [
        "share: named run missing",
        ["share", "fixture", "--run", "2026-01-01-watch-01"],
      ],
      ["restore: no archive named", ["restore"]],
      ["restore: missing archive", ["restore", "--from", "missing.tar.gz"]],
      ["new: no url", ["new", "another"]],
      ["new: no id", ["new", "--url", "https://example.com"]],
      ["new: existing id", ["new", "fixture", "--url", "https://example.com"]],
      ["new: bad id", ["new", "Bad_Id", "--url", "https://example.com"]],
      ["new: not a url", ["new", "another", "--url", "example"]],
    );
    const results = [];
    for (let i = 0; i < cases.length; i += 8)
      results.push(
        ...(await Promise.all(
          cases.slice(i, i + 8).map(([, args]) => wt(dir, args)),
        )),
      );
    for (const [i, [label]] of cases.entries()) actionable(results[i], label);
    const find = (label) =>
      results[cases.findIndex((c) => c[0] === label)].output;
    assert.match(find("no such tool"), /wt site-check --help/);
    assert.match(
      find("site-check: unknown project"),
      /Next: wt site-check fixture/,
    );
    assert.match(find("site-check: synonym"), /Use --site/);
    assert.match(find("watch: unknown option"), /wt watch --help/);
    assert.match(find("watch: no key"), /wt doctor/);
    assert.match(find("content: no inventory"), /wt inventory fixture/);
    assert.match(
      find("release: nothing to rehearse"),
      /wt release fixture pack/,
    );
    // Commands that need nothing still succeed on an empty project.
    for (const args of [
      ["status", "fixture"],
      ["index", "fixture"],
      ["prune", "fixture"],
      ["projects"],
    ]) {
      const ok = await wt(dir, args);
      assert.equal(ok.code, 0, `${args.join(" ")}\n${ok.output}`);
    }
    const debug = await wt(dir, ["share", "fixture"], { WT_DEBUG: "1" });
    assert.match(debug.output, /\bat .+:\d+:\d+/, "WT_DEBUG shows the stack");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the npm script names remain aliases of wt", async () => {
  const pkg = JSON.parse(
    await (
      await import("node:fs/promises")
    ).readFile(join(root, "package.json"), "utf8"),
  );
  for (const tool of [
    "capture",
    "site-check",
    "watch",
    "inventory",
    "content",
    "release",
  ])
    assert.equal(pkg.scripts[tool], `node scripts/wt.mjs ${tool}`);
  assert.equal(pkg.bin.wt, "scripts/wt.mjs");
  // PROJECT in the environment still selects the project.
  const dir = await fixtureRoot();
  try {
    const result = await wt(dir, ["status"], { PROJECT: "fixture" });
    assert.equal(result.code, 0);
    assert.match(result.output, /Fixture/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
