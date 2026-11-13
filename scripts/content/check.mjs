import { validWebUrl } from "../../src/content/model.js";
export function validateMap(map) {
  if (
    map?.version !== 1 ||
    map.tool !== "redirect-map" ||
    !Array.isArray(map.rules) ||
    !map.rules.length
  )
    throw Error("Expected a non-empty redirect map");
  if (
    !map.coverage ||
    !Number.isInteger(map.coverage.total) ||
    map.coverage.decided !== map.rules.length ||
    map.coverage.undecided !== map.coverage.total - map.rules.length ||
    map.coverage.undecided < 0 ||
    !["complete", "partial"].includes(map.coverage.inventoryState) ||
    map.complete !==
      (map.coverage.undecided === 0 &&
        map.coverage.inventoryState === "complete")
  )
    throw Error("Invalid map coverage");
  if (
    typeof map.projectId !== "string" ||
    !/^[-a-z0-9]+$/.test(map.projectId) ||
    !/^[a-f0-9]{64}$/.test(map.inventorySha256 || "") ||
    !map.sourceSite?.baseUrl
  )
    throw Error("Map identity is missing");
  const origin = new URL(validWebUrl(map.sourceSite.baseUrl)).origin;
  const seen = new Set();
  for (const rule of map.rules) {
    const expectedStatuses = {
      keep: [200],
      rewrite: [200],
      consolidate: [301, 308],
      remove: [404, 410],
    };
    if (!expectedStatuses[rule.decision]?.includes(rule.status))
      throw Error("Decision and HTTP status disagree");
    const source = validWebUrl(rule.source);
    if (
      source !== rule.source ||
      new URL(source).origin !== origin ||
      seen.has(source)
    )
      throw Error("Invalid or duplicate redirect source");
    seen.add(source);
    if (![200, 301, 308, 404, 410].includes(rule.status))
      throw Error("Unsupported expected HTTP status");
    if ([301, 308].includes(rule.status)) {
      if (
        !rule.destination ||
        validWebUrl(rule.destination) !== rule.destination ||
        rule.destination === source
      )
        throw Error("Invalid redirect destination");
    } else if (rule.destination)
      throw Error("Unexpected destination for a retained or removed URL");
  }
  return map;
}
export async function checkRule(
  rule,
  { base, fetcher = fetch, timeout = 15000, maxHops = 8 } = {},
) {
  const source = new URL(rule.source),
    expected = new URL(rule.destination || rule.source),
    actualSource = base
      ? new URL(source.pathname + source.search, base)
      : source,
    actualExpected =
      base && expected.origin === source.origin
        ? new URL(expected.pathname + expected.search, base)
        : expected;
  const allowed = new Set([actualSource.origin, actualExpected.origin]),
    chain = [],
    seen = new Set();
  let current = actualSource.href;
  const row = {
    source: rule.source,
    requestedUrl: actualSource.href,
    expectedStatus: rule.status,
    expectedDestination: rule.destination,
    chain,
    status: "fail",
  };
  try {
    for (let i = 0; i < maxHops; i++) {
      if (!allowed.has(new URL(current).origin))
        throw Error("Unexpected redirect origin");
      if (seen.has(current)) throw Error("Redirect loop");
      seen.add(current);
      const response = await fetcher(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeout),
        headers: { "User-Agent": "WebTools-RedirectCheck/1.0" },
      });
      const location = response.headers.get("location");
      chain.push({
        url: current,
        status: response.status,
        ...(location ? { location: new URL(location, current).href } : {}),
      });
      await response.body?.cancel();
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (!location) throw Error("Redirect response has no Location");
        const next = new URL(location, current);
        validWebUrl(next.href);
        current = next.href;
        continue;
      }
      const first = chain[0];
      if (first.status !== rule.status)
        throw Error(
          `Expected initial HTTP ${rule.status}; got ${first.status}`,
        );
      if (rule.destination) {
        if (chain.length !== 2)
          throw Error(`Expected one redirect; got ${chain.length - 1}`);
        if (first.location !== actualExpected.href)
          throw Error(`Wrong destination: ${first.location}`);
        if (response.status !== 200)
          throw Error(`Destination returned HTTP ${response.status}`);
        if (current !== actualExpected.href)
          throw Error("Final URL does not match");
      } else if (chain.length !== 1)
        throw Error("Unexpected redirect on a retained or removed URL");
      row.status = "pass";
      row.finalUrl = current;
      return row;
    }
    throw Error(`Too many redirects (maximum ${maxHops})`);
  } catch (e) {
    row.error = e.message;
    return row;
  }
}
