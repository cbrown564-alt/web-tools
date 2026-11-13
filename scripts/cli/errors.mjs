// One error path for every command: say what is wrong, then the command that fixes it.
export class CliError extends Error {
  constructor(message, next) {
    super(message);
    this.next = next;
  }
}
export const fail = (message, next) => {
  throw new CliError(message, next);
};
const relative = (path) =>
  String(path).startsWith(process.cwd() + "/")
    ? String(path).slice(process.cwd().length + 1)
    : String(path);

export function explain(error, { tool, project } = {}) {
  let message = error.message || String(error),
    next = error.next;
  const id = project || "<project>";
  if (error.code === "ENOENT" && error.path) {
    const file = relative(error.path);
    message = `Missing file: ${file}`;
    if (/release\.json$/.test(file))
      next ||= `Create ${file} naming the candidate folder and file list (docs/reference/release.md), then wt release ${id} pack`;
    else if (/\/inventory\/[^/]+\.json$/.test(file))
      next ||= `wt inventory ${id}`;
    else if (/maximum\.json$/.test(file))
      next ||= `Create ${file} with the question and journeys (docs/reference/site-check.md)`;
    else if (/\/evidence\/[^/]+\//.test(file))
      next ||= `wt status ${id}   (lists the runs that exist)`;
  }
  if (/PAGESPEED_INSIGHTS_API_KEY/.test(message)) next ||= "wt doctor";
  if (/Executable doesn't exist|playwright install/i.test(message)) {
    message = "Chromium for Playwright is not installed";
    next ||= "npx playwright install chromium";
  }
  if (error.code === "EEXIST" && error.path) {
    message = `A run named ${relative(error.path).split("/").pop()} already exists; saved runs are never overwritten`;
    next ||= "Leave out --run to use the next free name";
  }
  if (error instanceof SyntaxError) next ||= "Check the JSON file named above";
  next ||= tool ? `wt ${tool} --help` : "wt --help";
  return { message, next };
}

export function report(error, context = {}) {
  const { message, next } = explain(error, context);
  console.error(`wt${context.tool ? " " + context.tool : ""}: ${message}`);
  console.error(`Next: ${next}`);
  if (process.env.WT_DEBUG) console.error(error.stack);
}
