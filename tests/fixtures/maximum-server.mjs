import { createServer } from "node:http";
export async function maximumFixture({ rateLimit = false } = {}) {
  let posts = 0;
  const server = createServer(async (req, res) => {
    if (req.method === "POST") {
      posts++;
      res.writeHead(400);
      return res.end("No submissions");
    }
    const base = `http://${req.headers.host}`,
      path = new URL(req.url, base).pathname;
    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader("X-Cache", "HIT");
    res.setHeader("Set-Cookie", "private-fixture-value=exclude-this");
    if (path === "/robots.txt")
      return res.end(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml`);
    if (path === "/sitemap.xml") {
      res.setHeader("Content-Type", "application/xml");
      return res.end(
        `<urlset><url><loc>${base}/</loc></url><url><loc>${base}/gallery</loc></url></urlset>`,
      );
    }
    if (path === "/slow.js") {
      await new Promise((r) => setTimeout(r, 350));
      res.setHeader("Content-Type", "application/javascript");
      return res.end("window.syntheticSlowScriptLoaded=true;");
    }
    if (rateLimit && path === "/") {
      res.writeHead(503);
      return res.end("Unavailable synthetic fixture");
    }
    if (["/", "/gallery"].includes(path)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(
        `<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic maximum fixture</title><style>body{font:18px Arial;background:white;color:black;margin:24px}img{width:80px;height:50px}</style><main><h1>${path === "/" ? "Synthetic home" : "Synthetic gallery"}</h1><p>This is a controlled local performance fixture.</p><a id="next" href="/gallery">Gallery</a><a id="wrong" href="/">Home</a><a href="/logout">Do not crawl action</a><img alt="Synthetic rectangle" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='50'%3E%3Crect width='80' height='50' fill='navy'/%3E%3C/svg%3E"></main><script>fetch('/submit',{method:'POST'}).catch(()=>{});</script><script src="/slow.js"></script></html>`,
      );
    }
    res.writeHead(404);
    res.end("Not found");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const project = {
    id: "fixture",
    name: "Synthetic maximum fixture",
    sites: [{ id: "live", label: "Local synthetic fixture", baseUrl: base }],
    pages: [
      { id: "home", label: "Home", path: "/" },
      { id: "gallery", label: "Gallery", path: "/gallery" },
    ],
    devices: {
      desktop: { width: 900, height: 700 },
      mobile: { width: 390, height: 844 },
    },
  };
  const profile = {
    version: 1,
    projectId: "fixture",
    question:
      "Does suppressing a delayed script shorten the same visible journey?",
    repetitions: 3,
    crawl: { depth: 2, maxUrls: 20, maxSitemaps: 5 },
    journeys: [
      {
        id: "home-gallery",
        label: "Home to gallery",
        steps: [
          { page: "home", ready: "h1" },
          { page: "gallery", via: "#next", ready: "h1" },
        ],
      },
    ],
    parity: {
      selectors: ["h1", "main > p", "main > a", "img"],
      maxGeometryDeltaPx: 0.5,
      maxPixelChangeRatio: 0.001,
    },
    experiments: [
      {
        id: "slow-script",
        kind: "ablation",
        question: "Does the delayed script contribute to ready time?",
        journey: "home-gallery",
        site: "live",
        block: [{ url: base + "/slow.js", type: "script" }],
        minEffectMs: 200,
        minEffectRatio: 0.2,
      },
    ],
  };
  return {
    base,
    project,
    profile,
    get posts() {
      return posts;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}
