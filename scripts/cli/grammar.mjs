import { parseArgs } from "node:util";
import { CliError } from "./errors.mjs";

// The whole option vocabulary. Each name has one meaning wherever it appears.
export const vocabulary = {
  site: ["<id[,id]>", "Site to use: before, after, live or a competitor id"],
  pages: ["<id[,id]>", "Limit to these recorded pages"],
  devices: ["<desktop,mobile>", "Limit to these devices"],
  run: [
    "<name>",
    "Name the run this command creates, or choose the run it acts on. Default: the next number, or the latest run",
  ],
  render: [
    "[run]",
    "Rebuild a saved report without measuring. Default: latest",
  ],
  tier: ["<minimal|standard|maximum>", "Depth of the site check"],
  modules: [
    "<name[,name]>",
    "performance, cache, accessibility, security, discovery",
  ],
  profile: ["<file>", "JSON profile that configures this run"],
  "skip-site-check": [null, "Captures and assertions only"],
  compare: ["<run>", "Add a side-by-side sheet against this inventory run"],
  depth: ["<n>", "Link levels to follow beyond the sitemap"],
  "max-urls": ["<n>", "Stop after this many URLs"],
  "max-sitemaps": ["<n>", "Stop after this many sitemap documents"],
  captures: ["<all|representative|none>", "Which pages to capture"],
  "capture-limit": ["<n>", "Most pages a representative capture selects"],
  inventory: ["<run>", "Inventory run to review. Default: latest"],
  map: ["<file>", "Redirect map exported from the review page"],
  base: ["<origin>", "Check the map against this origin instead"],
  "allow-partial": [null, "Check a map that still has undecided pages"],
  spec: ["<file>", "Release specification. Default: the project's own"],
  package: ["<folder>", "Package folder. Default: the latest package run"],
  archive: ["<file>", "Package archive to verify before extracting"],
  sha: ["<sha256>", "Trusted pin. Default: the pin recorded by that run"],
  baseline: ["<run|folder>", "Files the release is applied over"],
  journal: ["<folder>", "Rehearsal journal. Default: the latest rehearsal"],
  target: ["<folder>", "Rehearsal target. Default: the latest rehearsal"],
  "after-only": [null, "Capture only the after site"],
  "replace-baseline": [null, "Replace existing before captures"],
  url: ["<https://site>", "The live site"],
  name: ["<text>", "Display name"],
  yes: [null, "Do it without asking"],
  out: ["<folder>", "Where to write the result"],
  from: ["<file>", "Archive file written by wt archive"],
  help: [null, "Show this help"],
};
const BOOLEAN = Object.entries(vocabulary)
  .filter(([, [value]]) => value === null)
  .map(([k]) => k);
const OPTIONAL_VALUE = ["render"];

export const exitCodes = [
  [0, "Done. Findings may still need review; read the report"],
  [1, "Could not start or finish: setup, input or runner failure"],
  [
    2,
    "Finished with something to act on: partial collection, failed checks or changes",
  ],
  [3, "Watch only: no accepted baseline yet"],
];

export const tools = {
  "site-check": {
    summary: "Check performance, cache, accessibility, security and discovery",
    options: [
      "tier",
      "modules",
      "site",
      "pages",
      "devices",
      "profile",
      "run",
      "render",
    ],
    defaults: { tier: "minimal" },
    examples: [
      "wt site-check velocity",
      "wt site-check london-potters --tier standard --modules performance,cache",
      "wt site-check velocity --tier maximum",
    ],
    key: true,
  },
  watch: {
    summary: "Compare a live site with its accepted baseline",
    actions: {
      run: "Capture and compare (default)",
      accept: "Make a reviewed run the baseline",
    },
    options: ["site", "pages", "devices", "skip-site-check", "run", "render"],
    examples: ["wt watch velocity", "wt watch velocity accept"],
    key: true,
  },
  inventory: {
    summary: "Crawl a site into one page inventory with captures",
    options: [
      "site",
      "captures",
      "capture-limit",
      "devices",
      "depth",
      "max-urls",
      "max-sitemaps",
      "compare",
      "run",
      "render",
    ],
    defaults: {
      depth: "2",
      "max-urls": "2000",
      "max-sitemaps": "40",
      captures: "all",
      "capture-limit": "24",
    },
    examples: ["wt inventory london-potters --captures representative"],
  },
  content: {
    summary: "Review page decisions and check the redirect map",
    actions: {
      prepare: "Build the review page from an inventory (default)",
      check: "Check a redirect map over HTTP",
    },
    options: ["inventory", "site", "map", "base", "allow-partial", "run"],
    examples: [
      "wt content elizabeth-norman",
      "wt content elizabeth-norman check --map ~/Downloads/map.json",
    ],
  },
  release: {
    summary: "Package, verify and rehearse a release; test forms locally",
    actions: {
      pack: "Package the files named in release.json (default)",
      verify: "Check a package or archive against its pin",
      rehearse: "Apply and reverse the package in a disposable copy",
      reverse: "Reverse a rehearsal again from its journal",
      forms: "Run marked form deliveries against a local inbox",
    },
    options: [
      "spec",
      "package",
      "archive",
      "sha",
      "baseline",
      "journal",
      "target",
      "profile",
      "run",
    ],
    examples: [
      "wt release elizabeth-norman pack",
      "wt release elizabeth-norman rehearse",
      "wt release elizabeth-norman forms",
    ],
  },
  capture: {
    summary: "Capture first-screen pairs for the before and after comparison",
    options: ["after-only", "replace-baseline"],
    examples: ["wt capture research-network"],
  },
  status: {
    summary: "Where a job stands and what to run next",
    options: [],
    projectOptional: true,
    examples: ["wt status", "wt status london-potters"],
  },
  index: {
    summary: "Rebuild the project's page of reports",
    options: [],
    examples: ["wt index london-potters"],
  },
  share: {
    summary: "Bundle one report for a client, without internal evidence",
    options: ["run", "out"],
    examples: [
      "wt share velocity",
      "wt share velocity --run 2026-11-13-watch-02",
    ],
  },
  prune: {
    summary: "List and remove runs nothing depends on",
    options: ["yes"],
    examples: ["wt prune london-potters", "wt prune london-potters --yes"],
  },
  archive: {
    summary: "Write one file holding a project's record and evidence",
    options: ["out"],
    examples: ["wt archive velocity"],
  },
  restore: {
    summary: "Unpack an archive and rebuild every report offline",
    options: ["from"],
    noProject: true,
    examples: ["wt restore --from output/archives/velocity-2026-11-13.tar.gz"],
  },
  new: {
    summary: "Create a project record from a live site",
    options: ["url", "name"],
    newProject: true,
    examples: ["wt new acme --url https://www.acme.example"],
  },
  projects: {
    summary: "List project records",
    options: [],
    noProject: true,
    examples: ["wt projects"],
  },
  doctor: {
    summary: "Check Node, Chromium, the API key and disk space",
    options: [],
    noProject: true,
    examples: ["wt doctor"],
  },
};

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = keep;
    }
  }
  return row[b.length];
}
export function nearest(word, candidates) {
  const best = candidates
    .map((c) => [distance(word, c), c])
    .sort((a, b) => a[0] - b[0])[0];
  return best && best[0] <= Math.max(2, Math.floor(word.length / 3))
    ? best[1]
    : null;
}

export function parseTool(tool, args = process.argv.slice(2)) {
  const spec = tools[tool];
  const names = [...spec.options, "help"];
  const input = [];
  for (let i = 0; i < args.length; i++) {
    input.push(args[i]);
    const name = args[i].startsWith("--") ? args[i].slice(2) : null;
    // An option with an optional value means "the latest run" when given bare.
    if (
      OPTIONAL_VALUE.includes(name) &&
      (args[i + 1] === undefined || args[i + 1].startsWith("--"))
    )
      input.push("latest");
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: input,
      allowPositionals: true,
      options: Object.fromEntries(
        names.map((n) => [
          n,
          {
            type: BOOLEAN.includes(n) ? "boolean" : "string",
            ...(spec.defaults?.[n] !== undefined
              ? { default: spec.defaults[n] }
              : {}),
          },
        ]),
      ),
    });
  } catch (error) {
    const unknown = /Unknown option '--?([^']+)'/.exec(error.message)?.[1];
    if (unknown) {
      const guess =
        unknown === "sites" ? "site" : nearest(unknown.split("=")[0], names);
      throw new CliError(
        `Unknown option --${unknown} for ${tool}`,
        guess ? `Use --${guess}, or wt ${tool} --help` : `wt ${tool} --help`,
      );
    }
    throw new CliError(
      error.message.split(". To specify")[0],
      `wt ${tool} --help`,
    );
  }
  const actions = Object.keys(spec.actions || {});
  if (
    parsed.positionals.length > (actions.length ? 1 : 0) ||
    (parsed.positionals[0] && !actions.includes(parsed.positionals[0]))
  )
    throw new CliError(
      actions.length
        ? `${tool} does not have an action called ${parsed.positionals.at(-1)}`
        : `${tool} takes no action; got ${parsed.positionals.join(" ")}`,
      actions.length
        ? `Use one of: ${actions.join(", ")}`
        : `wt ${tool} --help`,
    );
  return {
    values: { ...parsed.values },
    action: parsed.positionals[0] || actions[0],
    given: (name) =>
      input.some((a) => a === `--${name}` || a.startsWith(`--${name}=`)),
  };
}

export function help(tool) {
  if (!tool || !tools[tool]) {
    const width = Math.max(...Object.keys(tools).map((t) => t.length));
    return [
      "wt <tool> <project> [action] [options]",
      "",
      ...Object.entries(tools).map(
        ([name, t]) => `  ${name.padEnd(width)}  ${t.summary}`,
      ),
      "",
      "wt <tool> --help shows a tool's actions and options.",
      "Start with: wt doctor, wt projects, wt status",
    ].join("\n");
  }
  const t = tools[tool];
  const usage = `wt ${tool}${t.noProject ? "" : t.newProject ? " <new-id>" : t.projectOptional ? " [project]" : " <project>"}${t.actions ? " [action]" : ""}${t.options.length ? " [options]" : ""}`;
  const width = Math.max(
    0,
    ...t.options.map((o) => `--${o} ${vocabulary[o][0] || ""}`.length),
  );
  return [
    usage,
    t.summary + ".",
    ...(t.actions
      ? [
          "",
          "Actions:",
          ...Object.entries(t.actions).map(([a, d]) => `  ${a.padEnd(9)} ${d}`),
        ]
      : []),
    ...(t.options.length
      ? [
          "",
          "Options:",
          ...t.options.map(
            (o) =>
              `  ${`--${o} ${vocabulary[o][0] || ""}`.padEnd(width)}  ${vocabulary[o][1]}`,
          ),
        ]
      : []),
    "",
    "Examples:",
    ...t.examples.map((x) => `  ${x}`),
    "",
    "Exit codes:",
    ...exitCodes.map(([code, meaning]) => `  ${code}  ${meaning}`),
  ].join("\n");
}
