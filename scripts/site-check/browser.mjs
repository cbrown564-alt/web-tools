import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { headers, safeUrl } from "./core.mjs";

export function contextOptions(target) {
  return {
    viewport: target.viewport,
    deviceScaleFactor: 1,
    isMobile: target.device === "mobile",
    hasTouch: target.device === "mobile",
    locale: "en-GB",
    timezoneId: "Europe/London",
  };
}
export async function ready(page, url) {
  await page.bringToFront();
  const response = await page.goto(url, { waitUntil: "load", timeout: 25000 });
  if (!response?.ok())
    throw new Error(`HTTP ${response?.status() ?? "no response"}`);
  if (
    /just a moment|access denied|attention required/i.test(await page.title())
  )
    throw new Error("Access challenge");
  try {
    await page
      .locator('h1, main [role="heading"][aria-level="1"]')
      .filter({ visible: true })
      .first()
      .waitFor({ state: "visible", timeout: 4000 });
  } catch {
    throw new Error(
      "No visible main heading (h1 or level-one heading in main)",
    );
  }
  await page.waitForFunction(
    () =>
      document.fonts.status === "loaded" &&
      [...document.images]
        .filter((i) => {
          const r = i.getBoundingClientRect();
          return (
            r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0
          );
        })
        .every((i) => i.complete),
    null,
    { timeout: 6000 },
  );
  return response;
}
export async function metadata(page) {
  return page.evaluate(() => {
    const meta = (name) =>
      [...document.querySelectorAll("meta")]
        .filter(
          (e) =>
            e.getAttribute("name")?.toLowerCase() === name ||
            e.getAttribute("property")?.toLowerCase() === name,
        )
        .map((e) => e.content);
    return {
      title: document.title,
      headings: [...document.querySelectorAll("h1")].map((e) =>
        e.textContent.trim(),
      ),
      canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map(
        (e) => e.href,
      ),
      robots: meta("robots"),
      googlebot: meta("googlebot"),
      sharing: Object.fromEntries(
        [
          "description",
          "og:title",
          "og:description",
          "og:url",
          "og:image",
          "twitter:card",
          "twitter:title",
          "twitter:description",
          "twitter:image",
        ].map((k) => [k, meta(k)]),
      ),
      links: [
        ...new Set(
          [...document.querySelectorAll("a[href]")]
            .map((e) => e.href)
            .filter((u) => {
              try {
                return (
                  new URL(u).origin === location.origin &&
                  ["http:", "https:"].includes(new URL(u).protocol)
                );
              } catch {
                return false;
              }
            }),
        ),
      ],
      forms: [...document.forms].map((f) => ({
        method: f.method.toUpperCase(),
        action: f.action || location.href,
      })),
    };
  });
}
export async function keyboard(page) {
  const trail = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    trail.push(
      await page.evaluate(() => {
        const e = document.activeElement,
          s = getComputedStyle(e),
          r = e.getBoundingClientRect();
        return {
          tag: e.tagName.toLowerCase(),
          label: (e.getAttribute("aria-label") || e.textContent || e.id || "")
            .trim()
            .slice(0, 90),
          visible: r.width > 0 && r.height > 0,
          outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0,
          boxShadow: s.boxShadow !== "none",
        };
      }),
    );
  }
  const result = {
    trail,
    skip: { status: "review", reason: "No recognised skip link" },
    menu: { status: "review", reason: "No recognised menu toggle" },
    review: [
      "Check focus visibility and reading order visually; a computed outline alone does not prove usable focus.",
    ],
  };
  const skip = page
    .locator('a[href^="#"]')
    .filter({ hasText: /skip/i })
    .first();
  if (await skip.count()) {
    const href = await skip.getAttribute("href");
    await skip.focus();
    await page.keyboard.press("Enter");
    const focused = await page.evaluate((h) => {
      try {
        const dest = document.getElementById(decodeURIComponent(h.slice(1)));
        return (
          !!dest &&
          (dest === document.activeElement ||
            dest.contains(document.activeElement))
        );
      } catch {
        return false;
      }
    }, href);
    result.skip = {
      status: focused ? "ok" : "review",
      href,
      focusMoved: focused,
    };
  }
  const candidates = page
    .locator(
      'header button, nav button, [role="navigation"] button, button[aria-controls]',
    )
    .filter({ visible: true });
  for (const button of await candidates.all()) {
    const expanded = await button.getAttribute("aria-expanded");
    const label = (
      (await button.getAttribute("aria-label")) || (await button.innerText())
    ).trim();
    if (
      expanded === null ||
      !/menu|nav/i.test(
        label + " " + ((await button.getAttribute("aria-controls")) || ""),
      )
    )
      continue;
    if (expanded !== "false") continue;
    await button.focus();
    await page.keyboard.press("Enter");
    const opened = await button.getAttribute("aria-expanded");
    const controls = await button.getAttribute("aria-controls");
    const panel = controls
      ? page.locator(`[id=${JSON.stringify(controls)}]`)
      : null;
    if (panel && (await panel.count())) {
      const link = panel.locator("a,button").filter({ visible: true }).first();
      if (await link.count()) await link.focus();
    }
    await page.keyboard.press("Escape");
    const closed = await button.getAttribute("aria-expanded");
    const focusReturned = await button.evaluate(
      (e) => document.activeElement === e,
    );
    result.menu = {
      label,
      opened,
      closed,
      focusReturned,
      status:
        opened === "true" && closed === "false" && focusReturned
          ? "ok"
          : "review",
    };
    if (closed === "true") {
      await button.focus();
      await page.keyboard.press("Enter");
    }
    break;
  }
  return result;
}
export async function inspect(
  browser,
  target,
  { accessibility = false, standard = false } = {},
) {
  const context = await browser.newContext(contextOptions(target));
  try {
    const page = await context.newPage(),
      response = await ready(page, target.url);
    const meta = await metadata(page);
    const chain = [];
    let req = response.request();
    while (req) {
      const r = await req.response();
      if (r)
        chain.unshift({
          url: safeUrl(r.url()),
          status: r.status(),
          headers: headers(await r.allHeaders()),
        });
      req = req.redirectedFrom();
    }
    const result = {
      status: response.status(),
      finalUrl: page.url(),
      headers: headers(await response.allHeaders()),
      chain,
      metadata: meta,
    };
    if (accessibility) {
      try {
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        result.accessibility = {
          version: axe.testEngine.version,
          violations: axe.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              failureSummary: n.failureSummary,
            })),
          })),
          incomplete: axe.incomplete.map((v) => ({
            id: v.id,
            help: v.help,
            nodes: v.nodes.length,
          })),
          passes: axe.passes.length,
        };
        if (standard) result.accessibility.keyboard = await keyboard(page);
      } catch (error) {
        result.accessibility = { error: error.message };
      }
    }
    return result;
  } finally {
    await context.close();
  }
}
export async function browserLoads(browser, target) {
  const context = await browser.newContext(contextOptions(target));
  try {
    const page = await context.newPage(),
      cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    let requests = new Map(),
      networkRows = [];
    cdp.on("Network.requestWillBeSent", (e) => {
      const previous = requests.get(e.requestId);
      if (previous && e.redirectResponse)
        Object.assign(previous, {
          status: e.redirectResponse.status,
          transferBytes: e.redirectResponse.encodedDataLength,
        });
      const row = { url: safeUrl(e.request.url), type: e.type };
      requests.set(e.requestId, row);
      networkRows.push(row);
    });
    cdp.on("Network.responseReceived", (e) => {
      const r = requests.get(e.requestId);
      if (r)
        Object.assign(r, {
          status: e.response.status,
          fromDiskCache: !!e.response.fromDiskCache,
          fromServiceWorker: !!e.response.fromServiceWorker,
        });
    });
    cdp.on("Network.loadingFinished", (e) => {
      const r = requests.get(e.requestId);
      if (r) r.transferBytes = e.encodedDataLength;
    });
    cdp.on("Network.loadingFailed", (e) => {
      const r = requests.get(e.requestId);
      if (r) r.failure = e.errorText;
    });
    const loads = [];
    for (const mode of ["cold", "repeat"]) {
      requests = new Map();
      networkRows = [];
      await ready(page, target.url);
      const navigation = await page.evaluate(() =>
        performance.getEntriesByType("navigation")[0].toJSON(),
      );
      const resources = [...networkRows];
      loads.push({
        mode,
        navigation,
        requests: resources.length,
        transferBytes: resources.reduce(
          (n, r) => n + (r.transferBytes || 0),
          0,
        ),
        byType: Object.fromEntries(
          [...new Set(resources.map((r) => r.type))].map((type) => [
            type,
            {
              requests: resources.filter((r) => r.type === type).length,
              transferBytes: resources
                .filter((r) => r.type === type)
                .reduce((n, r) => n + (r.transferBytes || 0), 0),
            },
          ]),
        ),
        resources,
      });
    }
    return loads;
  } finally {
    await context.close();
  }
}
export { chromium };
