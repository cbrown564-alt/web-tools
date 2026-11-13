import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contextOptions } from "./browser.mjs";
import { safeUrl, headers } from "./core.mjs";
import { pageUrl, samePage, hash } from "./maximum-core.mjs";

const categories =
  "toplevel,devtools.timeline,v8.execute,blink.user_timing,loading,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-v8.cpu_profiler,disabled-by-default-devtools.screenshot";
export async function measureJourney(
  browser,
  project,
  journey,
  side,
  device,
  out,
  id,
  block = [],
) {
  const row = {
    id,
    side,
    device,
    journey: journey.id,
    state: "running",
    startedAt: new Date().toISOString(),
    steps: [],
    requests: [],
    blocked: [],
    artifacts: [],
    filmstrip: [],
  };
  const folder = `measurements/${id}`;
  await mkdir(resolve(out.dir, folder), { recursive: true });
  const context = await browser.newContext({
    ...contextOptions({ device, viewport: project.devices[device] }),
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const allowed = journey.steps.map((s) => pageUrl(project, side, s.page));
  await context.route("**/*", (route) => {
    const r = route.request(),
      u = r.url();
    const match = block.find((b) => b.url === u && b.type === r.resourceType());
    if (
      match ||
      !["GET", "HEAD"].includes(r.method()) ||
      (r.isNavigationRequest() &&
        !r.frame().parentFrame() &&
        !allowed.some((a) => samePage(a, u)))
    ) {
      row.blocked.push({
        url: safeUrl(u),
        method: r.method(),
        type: r.resourceType(),
        reason: match ? "experiment" : "read-only journey boundary",
      });
      return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket("**/*", (socket) => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(30000);
  const cdp = await context.newCDPSession(page);
  let tracing = false,
    traceStart = 0;
  const requests = new Map();
  cdp.on("Network.requestWillBeSent", (e) => {
    // A redirect reuses the request ID: retain each preceding hop.
    if (e.redirectResponse && requests.has(e.requestId)) {
      const old = requests.get(e.requestId);
      old.status = e.redirectResponse.status;
    }
    const r = {
      url: safeUrl(e.request.url),
      method: e.request.method,
      type: e.type?.toLowerCase(),
      at: e.timestamp,
    };
    requests.set(e.requestId, r);
    row.requests.push(r);
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = requests.get(e.requestId);
    if (r)
      Object.assign(r, {
        status: e.response.status,
        type: e.type?.toLowerCase(),
        headers: headers(e.response.headers),
        fromDiskCache: e.response.fromDiskCache,
        fromServiceWorker: e.response.fromServiceWorker,
        timing: e.response.timing,
      });
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = requests.get(e.requestId);
    if (r)
      Object.assign(r, { encodedBytes: e.encodedDataLength, end: e.timestamp });
  });
  cdp.on("Network.loadingFailed", (e) => {
    const r = requests.get(e.requestId);
    if (r) r.failure = e.errorText;
  });
  const artifact = async (file, kind, bytes) => {
    await writeFile(resolve(out.dir, file), bytes);
    row.artifacts.push({
      file,
      kind,
      bytes: bytes.length,
      sha256: hash(bytes),
    });
  };
  try {
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Performance.enable");
    await cdp.send("Tracing.start", {
      categories,
      transferMode: "ReturnAsStream",
    });
    tracing = true;
    traceStart =
      (await cdp.send("Performance.getMetrics")).metrics.find(
        (m) => m.name === "Timestamp",
      )?.value * 1e6;
    await page.addInitScript(() => {
      globalThis.__webToolsMetrics = { lcp: null, cls: 0, longTasksMs: 0 };
      for (const type of [
        "largest-contentful-paint",
        "layout-shift",
        "longtask",
      ]) {
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              if (type === "largest-contentful-paint")
                globalThis.__webToolsMetrics.lcp = e.startTime;
              if (type === "layout-shift" && !e.hadRecentInput)
                globalThis.__webToolsMetrics.cls += e.value;
              if (type === "longtask")
                globalThis.__webToolsMetrics.longTasksMs += e.duration;
            }
          }).observe({ type, buffered: true });
        } catch {
          /* unsupported metrics stay explicit */
        }
      }
    });
    await page.bringToFront();
    for (const [index, step] of journey.steps.entries()) {
      const url = pageUrl(project, side, step.page),
        start = performance.now();
      let status = null;
      if (step.via) {
        const link = page.locator(step.via).first();
        if (
          await link.evaluate(
            (n) =>
              n.tagName !== "A" ||
              n.target === "_blank" ||
              n.hasAttribute("download"),
          )
        )
          throw Error("Journey clicks must be same-tab navigation links");
        const destination = await link.getAttribute("href");
        if (
          !destination ||
          !samePage(new URL(destination, page.url()).href, url)
        )
          throw Error("Journey link does not point to the recorded next page");
        await link.click();
        await page.waitForURL((u) => samePage(u.href, url));
        await page.waitForLoadState("load");
        const doc = row.requests
          .filter((r) => r.type === "document" && samePage(r.url, page.url()))
          .at(-1);
        status = doc?.status ?? null;
        if (status !== null && status >= 400)
          throw Error(`Journey HTTP ${status}`);
      } else {
        const response = await page.goto(url, { waitUntil: "load" });
        status = response?.status();
        if (!response?.ok()) throw Error(`Journey HTTP ${status}`);
      }
      if (!samePage(page.url(), url))
        throw Error("Journey ended on another page");
      if (
        /just a moment|access denied|attention required/i.test(
          await page.title(),
        )
      )
        throw Error("Access challenge");
      await page
        .locator('h1, main [role="heading"][aria-level="1"]')
        .filter({ visible: true })
        .first()
        .waitFor();
      await page.locator(step.ready).first().waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          document.fonts.status === "loaded" &&
          [...document.images]
            .filter((i) => {
              const r = i.getBoundingClientRect();
              return (
                r.width > 0 &&
                r.height > 0 &&
                r.top < innerHeight &&
                r.bottom > 0
              );
            })
            .every((i) => i.complete && i.naturalWidth > 0),
      );
      const readyMs = performance.now() - start;
      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        return {
          ttfbMs: nav?.responseStart ?? null,
          fcpMs:
            performance.getEntriesByName("first-contentful-paint")[0]
              ?.startTime ?? null,
          observedLcpMs: globalThis.__webToolsMetrics?.lcp ?? null,
          observedCls: globalThis.__webToolsMetrics?.cls ?? null,
          longTasksMs: globalThis.__webToolsMetrics?.longTasksMs ?? null,
          navigationUrl: nav?.name ?? null,
        };
      });
      const layout = await page.evaluate((selectors) => {
        let truncated = false;
        const groups = Object.fromEntries(
          selectors.map((selector) => {
            const all = [...document.querySelectorAll(selector)];
            if (all.length > 500) truncated = true;
            return [
              selector,
              all.slice(0, 500).map((n) => {
                const r = n.getBoundingClientRect();
                return {
                  tag: n.tagName,
                  text: (n.textContent || "").replace(/\s+/g, " ").trim(),
                  rect: [r.x, r.y + scrollY, r.width, r.height],
                };
              }),
            ];
          }),
        );
        return {
          groups,
          truncated,
          height: document.documentElement.scrollHeight,
        };
      }, out.profile.parity.selectors);
      for (const group of Object.values(layout.groups))
        for (const node of group) {
          node.textSha256 = hash(node.text);
          node.text = node.text.slice(0, 160);
        }
      const file = `${folder}/step-${index + 1}.png`,
        bytes = await page.screenshot({ animations: "disabled" });
      await artifact(file, "viewport capture", bytes);
      row.steps.push({
        page: step.page,
        url: safeUrl(url),
        finalUrl: safeUrl(page.url()),
        status,
        readyMs,
        metrics,
        layout,
        capture: {
          file,
          sha256: hash(bytes),
          url: safeUrl(page.url()),
          viewport: project.devices[device],
          capturedAt: new Date().toISOString(),
          scope:
            "Viewport; reduced motion; animations disabled for parity capture",
        },
      });
    }
    row.readyMs = row.steps.reduce((n, s) => n + s.readyMs, 0);
    row.state = "complete";
  } catch (error) {
    row.state = "partial";
    row.error = error.message;
  } finally {
    try {
      if (tracing) {
        const complete = new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(Error("Trace completion timeout")),
            15000,
          );
          cdp.once("Tracing.tracingComplete", (e) => {
            clearTimeout(timer);
            resolve(e);
          });
        });
        await cdp.send("Tracing.end");
        const { stream, dataLossOccurred } = await complete;
        let text = "",
          size = 0;
        try {
          for (;;) {
            const chunk = await cdp.send("IO.read", {
              handle: stream,
              size: 1_000_000,
            });
            const data = chunk.base64Encoded
              ? Buffer.from(chunk.data, "base64").toString("utf8")
              : chunk.data;
            size += Buffer.byteLength(data);
            if (size > 100_000_000)
              throw Error("Performance trace exceeds 100 MB");
            text += data;
            if (chunk.eof) break;
          }
        } finally {
          await cdp.send("IO.close", { handle: stream });
        }
        const trace = JSON.parse(text),
          file = `${folder}/performance-trace.json`;
        await out.json(file, trace);
        const bytes = await readFile(resolve(out.dir, file));
        row.artifacts.push({
          file,
          kind: "Chrome performance trace",
          bytes: bytes.length,
          sha256: hash(bytes),
        });
        const frames = trace.traceEvents.filter(
          (e) =>
            e.name === "Screenshot" &&
            (e.args?.snapshot || e.args?.data?.snapshot),
        );
        const selected =
          frames.length <= 24
            ? frames
            : Array.from(
                { length: 24 },
                (_, i) => frames[Math.round((i * (frames.length - 1)) / 23)],
              );
        for (const [i, frame] of selected.entries()) {
          const file = `${folder}/frame-${String(i + 1).padStart(2, "0")}.jpg`,
            bytes = Buffer.from(
              frame.args.snapshot || frame.args.data.snapshot,
              "base64",
            );
          await artifact(file, "trace filmstrip frame", bytes);
          row.filmstrip.push({
            file,
            sha256: hash(bytes),
            traceTimestampUs: frame.ts,
            elapsedMs: Number.isFinite(traceStart)
              ? (frame.ts - traceStart) / 1000
              : null,
            source: "Chrome Screenshot trace event",
          });
        }
        row.trace = file;
        row.traceEvents = trace.traceEvents.length;
        if (dataLossOccurred) throw Error("Chrome reported trace event loss");
        if (!row.filmstrip.length)
          throw Error("Trace contains no screenshot events");
      }
    } catch (error) {
      row.traceError = error.message;
      row.state = "partial";
    }
    await context.close();
  }
  row.finishedAt = new Date().toISOString();
  return row;
}
