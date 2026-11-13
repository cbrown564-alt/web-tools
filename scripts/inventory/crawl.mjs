import { sitemapEntries } from "../site-check/sitemap.mjs";
import { normalize, inScope, inspectHtml, hash } from "./core.mjs";
export async function crawl(
  site,
  project,
  opts,
  net,
  onProgress = async () => {},
  history,
) {
  const robots = await net.init(),
    documents = [],
    sitemapUrls = new Set(),
    seenMaps = new Set(),
    queue = [],
    known = new Map(),
    rows = [],
    exclusions = {},
    limits = [],
    errors = [];
  const excluded = (reason) =>
    (exclusions[reason] = (exclusions[reason] || 0) + 1);
  function add(value, source, depth, from) {
    const n = normalize(value, source, site.baseUrl);
    if (!n.url) {
      excluded(n.reason);
      return;
    }
    const old = known.get(n.url);
    if (old) {
      if (!old.sources.includes(from)) old.sources.push(from);
      return;
    }
    if (depth > opts.depth) {
      excluded("beyond link depth");
      return;
    }
    if (known.size >= opts["max-urls"]) {
      limits.push("URL limit reached");
      return;
    }
    const item = { url: n.url, depth, sources: [from] };
    known.set(n.url, item);
    queue.push(item);
  }
  const candidates = [
    ...(project.inventory?.sitemaps || []),
    ...robots.sitemaps,
    ...["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"].map(
      (p) => new URL(p, site.baseUrl).href,
    ),
  ];
  let mapQueue = [];
  for (const candidate of [...new Set(candidates)]) {
    if (!inScope(candidate, site.baseUrl)) continue;
    try {
      const r = await net.request(candidate);
      const parsed = sitemapEntries(r.text);
      if (r.status !== 200) throw Error(`HTTP ${r.status}`);
      mapQueue.push({ url: candidate, response: r, parsed });
      break;
    } catch (e) {
      documents.push({ url: candidate, optional: true, error: e.message });
    }
  }
  while (mapQueue.length && seenMaps.size < opts["max-sitemaps"]) {
    const item = mapQueue.shift();
    if (seenMaps.has(item.url)) continue;
    seenMaps.add(item.url);
    try {
      const r = item.response || (await net.request(item.url));
      if (r.status !== 200) throw Error(`HTTP ${r.status}`);
      const parsed = item.parsed || sitemapEntries(r.text);
      documents.push({
        url: item.url,
        finalUrl: r.finalUrl,
        status: r.status,
        type: parsed.type,
        count: parsed.urls.length,
        sha256: hash(r.buffer),
      });
      if (parsed.type === "index") {
        for (const url of parsed.urls)
          if (
            inScope(url, site.baseUrl) &&
            !seenMaps.has(url) &&
            !mapQueue.some((x) => x.url === url)
          )
            mapQueue.push({ url });
      } else
        for (const url of parsed.urls) {
          const n = normalize(url, item.url, site.baseUrl);
          if (n.url) sitemapUrls.add(n.url);
          add(url, item.url, 0, `sitemap:${item.url}`);
        }
    } catch (e) {
      documents.push({ url: item.url, error: e.message });
      errors.push(`Sitemap: ${item.url}: ${e.message}`);
    }
  }
  if (mapQueue.length) limits.push("Sitemap document limit reached");
  if (!documents.some((d) => d.type === "urls"))
    errors.push("No URL sitemap collected");
  add(site.baseUrl, site.baseUrl, 0, "home");
  const primary = project.sites.some((s) => s.id === site.id);
  if (primary) {
    for (const p of project.pages)
      add(p[`${site.id}Path`] ?? p.path, site.baseUrl, 0, `record:${p.id}`);
    for (const url of history?.urls || [])
      add(url, site.baseUrl, 0, "historical reference");
    for (const u of project.inventory?.seeds || [])
      add(u, site.baseUrl, 0, "project seed");
  }
  for (const u of site.seeds || []) add(u, site.baseUrl, 0, "site seed");
  let index = 0,
    stopped = false;
  async function worker() {
    while (index < queue.length && !stopped) {
      const item = queue[index++];
      let row = { ...item, captures: [] };
      try {
        if (!net.allowed(item.url)) {
          row.collection = "excluded";
          row.error = "Disallowed by robots.txt";
        } else {
          const r = await net.request(item.url);
          const { text, buffer, ...meta } = r;
          row = {
            ...row,
            ...meta,
            collection: "ok",
            sha256: hash(buffer),
            html: /text\/html|application\/xhtml\+xml/i.test(
              r.headers["content-type"] || "",
            ),
          };
          if (row.html) {
            const parsed = inspectHtml(
              text,
              r.finalUrl,
              project.inventory?.templateRules,
            );
            const { links, ...facts } = parsed;
            Object.assign(row, facts);
            for (const link of links)
              add(link, r.finalUrl, item.depth + 1, `link:${item.url}`);
          }
          if (r.status === 429 || r.status === 503) {
            stopped = true;
            errors.push(`Stopped after HTTP ${r.status}: ${item.url}`);
          }
        }
      } catch (e) {
        row.collection = "error";
        row.error = e.message;
      }
      rows.push(row);
      await onProgress(rows, {
        queued: queue.length - index,
        known: known.size,
      });
    }
  }
  await Promise.all([worker(), worker()]);
  rows.sort((a, b) => a.url.localeCompare(b.url));
  return {
    rows,
    coverage: {
      robots,
      documents,
      sitemapUrls: [...sitemapUrls].sort(),
      uniqueSitemapUrls: sitemapUrls.size,
      discovered: known.size,
      collected: rows.length,
      pending: queue.slice(index).map((i) => i.url),
      exclusions,
      limits: [...new Set(limits)],
      errors,
      depth: opts.depth,
      complete:
        !limits.length &&
        !errors.length &&
        !stopped &&
        !rows.some((r) => r.collection === "error"),
    },
  };
}
