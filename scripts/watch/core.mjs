import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  mkdir,
  writeFile,
  rename,
  unlink,
  copyFile,
} from "node:fs/promises";
import { resolve, sep, basename } from "node:path";
import { parseArgs } from "node:util";
import { targets, redact } from "../site-check/core.mjs";
export const digest = (buffer) =>
  createHash("sha256").update(buffer).digest("hex");
export const runName = () =>
  `${new Date().toISOString().slice(0, 10)}-watch-${randomUUID().slice(0, 8)}`;
export function watchOptions(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      site: { type: "string" },
      pages: { type: "string" },
      devices: { type: "string" },
      run: { type: "string" },
      render: { type: "string" },
      help: { type: "boolean" },
      "skip-site-check": { type: "boolean", default: false },
    },
  });
  const action = positionals[0] || "run";
  if (!["run", "accept"].includes(action) || positionals.length > 1)
    throw new Error("Use watch [run|accept]");
  if (values.run && !/^[a-z0-9][a-z0-9-]{0,73}$/.test(values.run))
    throw new Error("--run must be a short lowercase name");
  return {
    ...values,
    action,
    pages: values.pages?.split(","),
    devices: values.devices?.split(","),
  };
}
export function watchSelection(project, opts) {
  const site =
    opts.site ||
    (project.sites.length === 1 ? project.sites[0].id : project.watch?.site);
  if (!site)
    throw new Error(
      "Choose --site before or --site after for a paired project",
    );
  if (!project.sites.some((s) => s.id === site))
    throw new Error(`Unknown site ${site}`);
  return targets(
    { ...project, sites: project.sites.filter((s) => s.id === site) },
    opts,
  );
}
export function watchPolicy(project, selected, { siteCheck = true } = {}) {
  const config = project.watch || {};
  const threshold = config.pixelThreshold ?? 0.15,
    ratio = config.maxChangedRatio ?? 0;
  if (
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1 ||
    !Number.isFinite(ratio) ||
    ratio < 0 ||
    ratio > 0.1
  )
    throw new Error(
      "Watch pixelThreshold must be 0–1 and maxChangedRatio 0–0.1",
    );
  const masks = config.masks || [];
  if (
    !Array.isArray(masks) ||
    masks.some((s) => typeof s !== "string" || !s.trim())
  )
    throw new Error("Watch masks must be CSS selectors");
  const assertions = config.assertions || [],
    ids = new Set();
  if (!Array.isArray(assertions))
    throw new Error("Watch assertions must be an array");
  for (const a of assertions) {
    if (!a || !/^[-a-z0-9]+$/.test(a.id || "") || ids.has(a.id))
      throw new Error("Watch assertions need unique ids");
    ids.add(a.id);
    if (!project.pages.some((p) => p.id === a.page))
      throw new Error(`Unknown assertion page ${a.page}`);
    if (
      !["visible", "script", "listing", "style", "attribute"].includes(
        a.type,
      ) ||
      typeof a.selector !== "string" ||
      !a.selector.trim()
    )
      throw new Error(`Invalid assertion ${a.id}`);
    if (
      a.type === "listing" &&
      (!Array.isArray(a.items) ||
        !a.items.length ||
        a.items.some((s) => typeof s !== "string" || !s.trim()))
    )
      throw new Error("Listing assertions need expected item text");
    if (a.type === "style" && (!a.property || typeof a.equals !== "string"))
      throw new Error("Style assertions need property and equals");
    if (
      a.type === "attribute" &&
      (typeof a.attribute !== "string" || typeof a.equals !== "string")
    )
      throw new Error("Attribute assertions need attribute and equals");
    if (
      a.minCount !== undefined &&
      (!Number.isInteger(a.minCount) || a.minCount < 1)
    )
      throw new Error("minCount must be a positive integer");
    if (a.device && !project.devices[a.device])
      throw new Error(`Unknown assertion device ${a.device}`);
  }
  const policy = {
    version: 1,
    siteCheck,
    targets: selected.map(({ page, side, device, viewport, url }) => ({
      page,
      side,
      device,
      viewport,
      url,
    })),
    pixelThreshold: threshold,
    maxChangedRatio: ratio,
    masks,
    assertions,
  };
  return { ...policy, sha256: digest(JSON.stringify(policy)) };
}
export async function assertionsFor(page, target, assertions) {
  const rows = [];
  for (const a of assertions.filter(
    (a) => a.page === target.page && (!a.device || a.device === target.device),
  )) {
    const row = {
      id: a.id,
      type: a.type,
      selector: a.selector,
      status: "pass",
    };
    try {
      const locator = page.locator(a.selector);
      if (a.type === "visible") {
        row.count = await locator.filter({ visible: true }).count();
        if (row.count < (a.minCount ?? 1))
          throw new Error(
            `Expected at least ${a.minCount ?? 1} visible element(s), found ${row.count}`,
          );
      }
      if (a.type === "script") {
        row.count = await locator.count();
        if (!row.count) throw new Error("Required script is missing");
        const tags = await locator.evaluateAll((nodes) =>
          nodes.map((n) => n.tagName),
        );
        if (tags.some((t) => t !== "SCRIPT"))
          throw new Error("Script selector matched a non-script element");
      }
      if (a.type === "listing") {
        const text = (await locator.filter({ visible: true }).allInnerTexts())
          .join(" ")
          .replace(/\s+/g, " ");
        row.missing = a.items.filter((item) => !text.includes(item));
        if (row.missing.length)
          throw new Error(`Listing is missing: ${row.missing.join(", ")}`);
      }
      if (a.type === "attribute") {
        row.value = await locator
          .first()
          .getAttribute(a.attribute, { timeout: 3000 });
        if (row.value !== a.equals)
          throw new Error(
            `Expected ${a.attribute}: ${a.equals}; found ${row.value}`,
          );
      }
      if (a.type === "style") {
        if (!(await locator.count()))
          throw new Error("Styled element is missing");
        row.value = await locator
          .first()
          .evaluate(
            (node, property) =>
              getComputedStyle(node).getPropertyValue(property),
            a.property,
          );
        if (row.value !== a.equals)
          throw new Error(
            `Expected ${a.property}: ${a.equals}; found ${row.value}`,
          );
      }
    } catch (error) {
      row.status = "fail";
      row.reason = error.message;
    }
    rows.push(row);
  }
  return rows;
}
export async function createWatchRun(projectDir, name = runName()) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(name))
    throw new Error("Invalid watch run name");
  const root = resolve(projectDir, "evidence");
  await mkdir(root, { recursive: true });
  const dir = resolve(root, name);
  await mkdir(dir);
  return {
    name,
    dir,
    json: async (file, value) =>
      writeFile(
        resolve(dir, file),
        JSON.stringify(redact(value), null, 2) + "\n",
      ),
  };
}
export async function baselineFor(projectDir, site) {
  try {
    return JSON.parse(
      await readFile(resolve(projectDir, "watch", `${site}.json`), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
export async function readWatchRun(projectDir, name) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(name))
    throw new Error("Invalid watch run name");
  const dir = resolve(projectDir, "evidence", name);
  const data = JSON.parse(await readFile(resolve(dir, "results.json"), "utf8"));
  if (data.project?.id !== basename(projectDir))
    throw new Error("Watch run belongs to another project");
  if (data.tool !== "watch") throw new Error("This is not a watch run");
  return { dir, data };
}
export async function acceptBaseline(projectDir, name, project) {
  const { dir, data } = await readWatchRun(projectDir, name);
  if (project) {
    const selected = watchSelection(project, {
      site: data.site,
      pages: [...new Set(data.policy.targets.map((t) => t.page))],
      devices: [...new Set(data.policy.targets.map((t) => t.device))],
    });
    if (
      watchPolicy(project, selected, { siteCheck: data.policy.siteCheck })
        .sha256 !== data.policy.sha256
    )
      throw new Error("Project settings changed since this run; capture again");
  }
  if (
    !data.finishedAt ||
    !["quiet", "changed", "baseline-required"].includes(data.state) ||
    data.rows.length !== data.policy.targets.length
  )
    throw new Error("Cannot accept an incomplete watch run");
  if (
    !data.rows.length ||
    data.rows.some(
      (r) => r.status !== "ok" || r.assertions.some((a) => a.status === "fail"),
    )
  )
    throw new Error("Cannot accept a run with capture or assertion failures");
  if (data.siteCheck?.state === "error" || data.siteCheck?.state === "partial")
    throw new Error("Cannot accept incomplete site-check collection");
  for (const row of data.rows) {
    const path = resolve(dir, row.capture.file);
    if (!path.startsWith(dir + sep))
      throw new Error("Capture path escapes the run");
    if (digest(await readFile(path)) !== row.capture.sha256)
      throw new Error("Capture hash does not match");
  }
  const root = resolve(projectDir, "watch");
  await mkdir(root, { recursive: true });
  const lock = resolve(root, `${data.site}.lock`);
  const handle = await (await import("node:fs/promises")).open(lock, "wx");
  try {
    const previous = await baselineFor(projectDir, data.site);
    if (previous?.run === name) {
      if (
        previous.resultsSha256 !==
        digest(await readFile(resolve(dir, "results.json")))
      )
        throw new Error("Accepted baseline results were changed");
      return previous;
    }
    if ((previous?.run ?? null) !== (data.baseline?.run ?? null))
      throw new Error(
        "Baseline changed since this run; make a fresh comparison before accepting",
      );
    const pointer = {
      version: 1,
      projectId: data.project.id,
      site: data.site,
      run: name,
      policySha256: data.policy.sha256,
      resultsSha256: digest(await readFile(resolve(dir, "results.json"))),
      acceptedAt: new Date().toISOString(),
      previousRun: previous?.run ?? null,
    };
    const file = resolve(root, `${data.site}.json`);
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(pointer, null, 2) + "\n");
    await rename(tmp, file);
    return pointer;
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
export async function loadBaseline(projectDir, pointer) {
  if (!pointer) return null;
  const { dir, data } = await readWatchRun(projectDir, pointer.run);
  if (
    digest(await readFile(resolve(dir, "results.json"))) !==
    pointer.resultsSha256
  )
    throw new Error("Accepted baseline results were changed");
  return { dir, data };
}
export async function copyBaselineImage(baseline, row, dir, name) {
  const source = resolve(baseline.dir, row.capture.file);
  if (
    !source.startsWith(baseline.dir + sep) ||
    digest(await readFile(source)) !== row.capture.sha256
  )
    throw new Error("Accepted baseline capture was changed");
  await copyFile(source, resolve(dir, name));
}

export function watchState(data, hasBaseline) {
  if (
    data.rows.some(
      (r) => r.status !== "ok" || r.assertions.some((a) => a.status === "fail"),
    ) ||
    ["error", "partial"].includes(data.siteCheck?.state)
  )
    return "failed";
  if (!hasBaseline) return "baseline-required";
  return data.rows.some((r) => r.diff?.changed) || data.siteCheckChanges?.length
    ? "changed"
    : "quiet";
}
