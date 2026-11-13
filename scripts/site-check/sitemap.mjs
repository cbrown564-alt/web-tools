import { XMLParser, XMLValidator } from "fast-xml-parser";
import { request, safeUrl } from "./core.mjs";
const parser = new XMLParser({
  ignoreAttributes: true,
  processEntities: true,
  removeNSPrefix: true,
});
const list = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
export function sitemapEntries(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Sitemap must not declare entities or a document type");
  if (XMLValidator.validate(xml) !== true)
    throw new Error("Invalid sitemap XML");
  const doc = parser.parse(xml);
  if (!doc.urlset && !doc.sitemapindex) throw new Error("Not a sitemap");
  const type = doc.sitemapindex ? "index" : "urls";
  return {
    type,
    urls: list(type === "index" ? doc.sitemapindex.sitemap : doc.urlset.url)
      .map((r) => r.loc)
      .filter((v) => typeof v === "string"),
  };
}
export async function sitemap(
  base,
  { maxDocuments = 6, sampleSize = 12 } = {},
) {
  const origin = new URL(base).origin,
    allowed = new Set([origin]),
    queue = [],
    documents = [],
    urls = new Set();
  try {
    const r = await request(new URL("/robots.txt", base).href, { body: true });
    if (r.status === 200)
      for (const m of r.text.matchAll(/^sitemap:\s*(\S+)/gim)) queue.push(m[1]);
  } catch {
    /* Default sitemap paths are tried below. */
  }
  queue.push(
    new URL("/sitemap.xml", base).href,
    new URL("/wp-sitemap.xml", base).href,
  );
  const visited = new Set();
  while (queue.length && documents.length < maxDocuments) {
    const url = queue.shift();
    let u;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    if (!allowed.has(u.origin) || visited.has(u.href)) continue;
    visited.add(u.href);
    try {
      const r = await request(u.href, { body: true });
      const final = new URL(r.finalUrl);
      // Permit a site's apex/www redirect, not arbitrary external sitemap hosts.
      if (
        final.hostname.replace(/^www\./, "") !==
        new URL(origin).hostname.replace(/^www\./, "")
      )
        throw new Error("Sitemap redirected off site");
      allowed.add(final.origin);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const parsed = sitemapEntries(r.text);
      documents.push({
        url: safeUrl(u.href),
        finalUrl: r.finalUrl,
        status: r.status,
        type: parsed.type,
        count: parsed.urls.length,
      });
      if (parsed.type === "index") queue.unshift(...parsed.urls.slice(0, 100));
      else
        for (const value of parsed.urls) {
          try {
            const p = new URL(value);
            if (
              allowed.has(p.origin) &&
              !p.username &&
              !p.password &&
              ["https:", "http:"].includes(p.protocol)
            )
              urls.add(p.href);
          } catch {}
        }
    } catch (e) {
      documents.push({ url: safeUrl(u.href), error: e.message });
    }
  }
  const sorted = [...urls].sort();
  const sample =
    sorted.length <= sampleSize
      ? sorted
      : Array.from(
          { length: sampleSize },
          (_, i) =>
            sorted[Math.floor((i * (sorted.length - 1)) / (sampleSize - 1))],
        );
  return {
    base,
    documents,
    urls: sorted,
    sample,
    limits: { maxDocuments, sampleSize },
    complete:
      queue.length === 0 &&
      documents.some((d) => d.type === "urls") &&
      !documents.some((d) => d.error),
    remainingDocuments: queue.length,
  };
}
