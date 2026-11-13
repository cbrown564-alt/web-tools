import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdtemp, mkdir, rm, cp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { collectWatchCapture } from "../scripts/watch/capture.mjs";
import {
  watchPolicy,
  watchState,
  createWatchRun,
  baselineFor,
  loadBaseline,
  acceptBaseline,
} from "../scripts/watch/core.mjs";
import { writeWatchReport } from "../scripts/watch/report.mjs";
const fixture = new URL("./fixtures/watch/", import.meta.url);

test("saved ENI sections replay loader omission, gallery CSS loss, missing new article, and quiet acceptance", async () => {
  const pages = Object.fromEntries(
    await Promise.all(
      ["home", "gallery", "resources"].map(async (name) => [
        name,
        await readFile(new URL(`${name}.html`, fixture), "utf8"),
      ]),
    ),
  );
  const loader = await readFile(
      new URL("herefish-header.html", fixture),
      "utf8",
    ),
    css = await readFile(new URL("gallery.css", fixture), "utf8");
  let defect = "none",
    externalRequests = [];
  const server = createServer((req, res) => {
    if (req.url === "/scripts/hf.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(
        "/* Herefish is deliberately inactive in this offline replay. */",
      );
    }
    if (req.url === "/fixture-image.svg") {
      res.setHeader("Content-Type", "image/svg+xml");
      return res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#cedbe6"/><path d="M0 120L80 25L160 120" fill="#60788c"/></svg>',
      );
    }
    if (req.url === "/gallery.css") {
      res.setHeader("Content-Type", "text/css");
      return res.end(
        defect === "gallery-css" ? "/* missing gallery rules */" : css,
      );
    }
    const name = req.url.slice(1);
    let html = pages[name];
    if (!html) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    if (defect === "loader" && name === "home") html = html.replace(loader, "");
    if (defect === "new-article" && name === "resources")
      html = html.replace(/<article\b[^>]*>[\s\S]*?<\/article>/g, (block) =>
        block.includes("The Bell Curve is Killing Talent") ? "" : block,
      );
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const temp = await mkdtemp(join(tmpdir(), "eni-watch-")),
    projectDir = join(temp, "eni-replay");
  await mkdir(projectDir);
  const browser = await chromium.launch();
  const url = `http://127.0.0.1:${server.address().port}`;
  const targets = ["home", "gallery", "resources"].map((page) => ({
    page,
    label: page,
    side: "live",
    device: "desktop",
    viewport: { width: 900, height: 700 },
    url: `${url}/${page}`,
  }));
  const project = {
    id: "eni-replay",
    name: "ENI saved-section replay",
    pages: targets.map((t) => ({ id: t.page })),
    devices: { desktop: targets[0].viewport },
    watch: {
      assertions: [
        {
          id: "herefish-loader",
          page: "home",
          type: "script",
          selector: 'script[src$="/scripts/hf.js"]',
        },
        {
          id: "gallery-layout",
          page: "gallery",
          type: "style",
          selector: ".eni-reading-body .gallery-columns-3",
          property: "display",
          equals: "grid",
        },
        {
          id: "september-article",
          page: "resources",
          type: "listing",
          selector: ".resource-row",
          items: ["The Bell Curve is Killing Talent"],
        },
      ],
    },
  };
  const policy = watchPolicy(project, targets, { siteCheck: false });
  async function run(name) {
    const pointer = await baselineFor(projectDir, "live"),
      baseline = await loadBaseline(projectDir, pointer),
      out = await createWatchRun(projectDir, name);
    const rows = [];
    for (const target of targets)
      rows.push(
        await collectWatchCapture(
          browser,
          target,
          policy,
          out,
          baseline,
          async (context) => {
            await context.route("**/*", (route) => {
              const requestUrl = route.request().url();
              if (new URL(requestUrl).origin === url) return route.continue();
              externalRequests.push(requestUrl);
              return route.abort();
            });
          },
        ),
      );
    const data = {
      version: 1,
      tool: "watch",
      project: { id: project.id, name: project.name },
      run: name,
      site: "live",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      baseline: pointer,
      policy,
      rows,
      siteCheck: {
        state: "skipped",
        reason: "Offline replay: no external site checks",
      },
    };
    data.state = watchState(data, Boolean(baseline));
    await out.json("results.json", data);
    await out.json("conditions.json", {
      fixture: true,
      provenance: JSON.parse(
        await readFile(new URL("provenance.json", fixture), "utf8"),
      ),
    });
    await writeWatchReport(out.dir, data);
    return { out, data };
  }
  try {
    const baseline = await run("baseline");
    assert.ok(
      baseline.data.rows.every((r) => r.status === "ok"),
      JSON.stringify(baseline.data.rows.filter((r) => r.status !== "ok")),
    );
    assert.ok(
      baseline.data.rows.every((r) =>
        r.assertions.every((a) => a.status === "pass"),
      ),
    );
    await acceptBaseline(projectDir, "baseline");
    const quiet = await run("quiet");
    assert.equal(quiet.data.state, "quiet");
    assert.ok(quiet.data.rows.every((r) => r.diff.changedPixels === 0));
    for (const [mode, id] of [
      ["loader", "herefish-loader"],
      ["gallery-css", "gallery-layout"],
      ["new-article", "september-article"],
    ]) {
      defect = mode;
      const result = await run(mode);
      assert.equal(result.data.state, "failed");
      assert.ok(
        result.data.rows.some((r) =>
          r.assertions.some((a) => a.id === id && a.status === "fail"),
        ),
        id,
      );
      await assert.rejects(acceptBaseline(projectDir, mode));
      assert.equal((await baselineFor(projectDir, "live")).run, "baseline");
      if (mode !== "loader")
        assert.ok(
          result.data.rows.some((r) => r.diff?.changed),
          "Visible layout/content loss must change captures",
        );
    }
    defect = "none";
    const recovered = await run("recovered");
    assert.equal(recovered.data.state, "quiet");
    assert.deepEqual(externalRequests, [], "Replay must stay entirely local");
    if (process.env.SAVE_WATCH_REPLAY) {
      await mkdir("output/watch-replay", { recursive: true });
      await cp(join(projectDir, "evidence"), "output/watch-replay", {
        recursive: true,
        force: true,
      });
      console.log("Replay reports saved in output/watch-replay/");
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});
