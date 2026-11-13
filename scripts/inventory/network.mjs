import robotsParser from "robots-parser";
import { agent, inScope, normalize } from "./core.mjs";
import { safeUrl } from "../site-check/core.mjs";
export function network(
  base,
  { interval = 250, timeout = 15000, maxBytes = 4000000 } = {},
) {
  let next = 0,
    delay = interval,
    robots;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function request(url, { policy = true } = {}) {
    const startedAt = new Date().toISOString(),
      chain = [],
      start = performance.now();
    let current = url;
    for (let i = 0; i < 8; i++) {
      if (!inScope(current, base))
        throw Error("Redirect or URL is outside the selected site");
      const exclusion = normalize(current, current, base).reason;
      if (exclusion && !["asset, API or feed"].includes(exclusion))
        throw Error(`Request excluded: ${exclusion}`);
      if (
        policy &&
        robots?.isAllowed(
          new URL(new URL(current).pathname + new URL(current).search, base)
            .href,
          agent,
        ) === false
      )
        throw Error("Disallowed by robots.txt");
      const wait = Math.max(0, next - Date.now());
      next = Math.max(next, Date.now()) + delay;
      if (wait) await sleep(wait);
      const hopStart = performance.now();
      const response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeout),
        headers: {
          "User-Agent": agent,
          Accept: "text/html,application/xml,text/xml,text/plain;q=0.9",
        },
      });
      const ttfbMs = performance.now() - hopStart;
      const location = response.headers.get("location");
      chain.push({
        url: safeUrl(current),
        status: response.status,
        ...(location
          ? { location: safeUrl(new URL(location, current).href) }
          : {}),
      });
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        await response.body?.cancel();
        current = new URL(location, current).href;
        continue;
      }
      const headers = Object.fromEntries(
        [
          "content-type",
          "content-length",
          "cache-control",
          "age",
          "x-cache",
          "cf-cache-status",
          "vary",
          "server-timing",
          "server",
          "x-powered-by",
          "x-robots-tag",
        ]
          .map((k) => [k, response.headers.get(k)])
          .filter(([, v]) => v),
      );
      const chunks = [];
      let bytes = 0;
      if (
        response.body &&
        !/text\/html|application\/(?:xhtml\+xml|xml)|text\/(?:xml|plain)/i.test(
          headers["content-type"] || "",
        )
      ) {
        await response.body.cancel();
      } else if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > maxBytes)
              throw Error(`Document exceeds ${maxBytes} bytes`);
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
      }
      return {
        url: safeUrl(url),
        finalUrl: safeUrl(current),
        status: response.status,
        chain,
        headers,
        startedAt,
        durationMs: performance.now() - start,
        ttfbMs,
        decodedBytes: bytes,
        buffer: Buffer.concat(chunks),
        text: Buffer.concat(chunks).toString("utf8"),
      };
    }
    throw Error("Too many redirects");
  }
  return {
    request,
    async init() {
      const r = await request(new URL("/robots.txt", base).href, {
        policy: false,
      });
      if (r.status >= 500 || r.status === 429 || [401, 403].includes(r.status))
        throw Error(`robots.txt unavailable: HTTP ${r.status}`);
      robots = robotsParser(
        new URL("/robots.txt", base).href,
        r.status === 200 ? r.text : "",
      );
      delay = Math.max(interval, (robots.getCrawlDelay(agent) || 0) * 1000);
      if (delay > 60000)
        throw Error(
          "robots.txt crawl delay exceeds one minute; run requires a slower external scheduler",
        );
      return {
        url: r.url,
        status: r.status,
        sitemaps: robots.getSitemaps(),
        sha256: (await import("./core.mjs")).hash(r.buffer),
        crawlDelayMs: delay,
      };
    },
    allowed(url) {
      return (
        robots?.isAllowed(
          new URL(new URL(url).pathname + new URL(url).search, base).href,
          agent,
        ) !== false
      );
    },
  };
}
