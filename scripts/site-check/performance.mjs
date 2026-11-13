import lighthouse from "lighthouse";
import puppeteer from "puppeteer-core";
import { chromium } from "playwright";
import { performanceSummary } from "./core.mjs";
export async function pagespeed(target, key, fetcher = fetch) {
  const url = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  url.searchParams.set("url", target.url);
  url.searchParams.set(
    "strategy",
    target.device === "mobile" ? "mobile" : "desktop",
  );
  // A header keeps the key out of request URLs, errors and result provenance.
  const r = await fetcher(url, {
    headers: { "X-Goog-Api-Key": key },
    signal: AbortSignal.timeout(100000),
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error(
      `PageSpeed HTTP ${r.status}${r.status === 429 ? " (quota/rate limit)" : r.status === 403 ? " (check API enabled and key restrictions)" : ""}`,
    );
  }
  const raw = await r.json();
  return {
    raw,
    summary: {
      ...performanceSummary(raw.lighthouseResult),
      field: {
        page: raw.loadingExperience ?? null,
        origin: raw.originLoadingExperience ?? null,
        note: "Historical visitor data when available; Google plans to remove CrUX data from this API. Missing data is not a failed test.",
      },
    },
  };
}
export const throttling = {
  mobile: {
    rttMs: 150,
    throughputKbps: 1638.4,
    cpuSlowdownMultiplier: 4,
    requestLatencyMs: 562.5,
    downloadThroughputKbps: 1474.56,
    uploadThroughputKbps: 675,
  },
  desktop: {
    rttMs: 40,
    throughputKbps: 10240,
    cpuSlowdownMultiplier: 1,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
  },
};
export async function localLighthouse(target) {
  // A new browser as well as a fresh context prevents browser-state leakage.
  const browser = await puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
    args: ["--no-first-run"],
  });
  try {
    const context = await browser.createBrowserContext(),
      page = await context.newPage();
    await page.bringToFront();
    const mobile = target.device === "mobile";
    const result = await lighthouse(
      target.url,
      {
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance"],
        formFactor: mobile ? "mobile" : "desktop",
        screenEmulation: {
          mobile,
          ...target.viewport,
          deviceScaleFactor: 1,
          disabled: false,
        },
        throttlingMethod: "simulate",
        throttling: throttling[mobile ? "mobile" : "desktop"],
        maxWaitForLoad: 30000,
      },
      undefined,
      page,
    );
    return { raw: result.lhr, summary: performanceSummary(result.lhr) };
  } finally {
    await browser.close();
  }
}
