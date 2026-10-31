import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    limit: { type: "string", default: "30" },
    workflow: { type: "string", default: "ci.yml" },
    json: { type: "boolean", default: false },
  },
});

const ATTEMPTS = 3;

function gh(args) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return execFileSync("gh", args, {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      if (attempt >= ATTEMPTS) throw error;
    }
  }
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\S+Z /;

function logLines(jobId) {
  try {
    return gh([
      "api",
      "--allow-escape-sequences",
      `repos/{owner}/{repo}/actions/jobs/${jobId}/logs`,
    ])
      .replace(ANSI, "")
      .split(/\r?\n/)
      .map((line) => line.replace(TIMESTAMP, ""));
  } catch {
    return [];
  }
}

function failuresInLog(lines) {
  const failures = new Set();
  for (const [index, line] of lines.entries()) {
    const vitest = line.match(/\bFAIL\s+(\S+\.test\.\w+ > .+?)(?:\s+\d+ms)?$/);
    if (vitest) failures.add(`test: ${vitest[1].trim()}`);
    const scenario = line.match(/"scenario": "([^"]+)"/);
    if (scenario && /"passed": false/.test(lines[index + 1] ?? "")) {
      failures.add(`scenario: ${scenario[1]}`);
    }
    const maestro = line.match(/^\s*(.+?)\.\.\. FAILED$/);
    if (maestro) failures.add(`maestro: ${maestro[1].trim()}`);
  }
  return [...failures];
}

const runs = JSON.parse(
  gh([
    "run",
    "list",
    "--workflow",
    values.workflow,
    "--status",
    "failure",
    "--limit",
    values.limit,
    "--json",
    "databaseId,headBranch,createdAt",
  ]),
);

const tally = new Map();
for (const run of runs) {
  let jobs;
  try {
    jobs = JSON.parse(
      gh([
        "api",
        `repos/{owner}/{repo}/actions/runs/${run.databaseId}/jobs?filter=latest&per_page=30`,
        "--jq",
        ".jobs",
      ]),
    );
  } catch {
    process.stderr.write(`skipped run ${run.databaseId}: jobs unavailable\n`);
    continue;
  }
  for (const job of jobs.filter((item) => item.conclusion === "failure")) {
    const found = failuresInLog(logLines(job.id));
    const keys = found.length > 0 ? found : [`job: ${job.name}`];
    for (const key of keys) {
      const entry = tally.get(key) ?? { failure: key, count: 0, runs: [] };
      entry.count += 1;
      entry.runs.push({
        run: run.databaseId,
        job: job.name,
        branch: run.headBranch,
        at: run.createdAt,
      });
      tally.set(key, entry);
    }
  }
}

const ranked = [...tally.values()].sort((a, b) => b.count - a.count);
if (values.json) {
  process.stdout.write(`${JSON.stringify(ranked, null, 2)}\n`);
} else {
  process.stdout.write(`${runs.length} failed runs of ${values.workflow}\n`);
  for (const entry of ranked) {
    const branches = new Set(entry.runs.map((item) => item.branch)).size;
    process.stdout.write(
      `${String(entry.count).padStart(3)}  ${branches} branch(es)  ${entry.failure}\n`,
    );
  }
}
