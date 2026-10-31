import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { launchSharedScenarioInstance } from "./lib/app.mjs";
import { processTreeMemory, stopProcessTree } from "./lib/instance.mjs";

const SCENARIO_ENTRY = /^runScenario\(/m;
const ALIVE_TIMEOUT_MS = 2_000;
const SCENARIO_TIMEOUT_MS = 5 * 60_000;

const runnerPath = fileURLToPath(import.meta.url);
const scenarioDir = path.dirname(runnerPath);
const { values: args, positionals: only } = parseArgs({
  allowPositionals: true,
  options: { isolated: { type: "boolean", default: false } },
});

async function findScenarios() {
  const entries = await readdir(scenarioDir, { withFileTypes: true });
  const scenarios = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".mjs")) continue;
    const entryPath = path.join(scenarioDir, entry.name);
    if (entryPath === runnerPath) continue;
    if (only.length && !only.includes(path.basename(entry.name, ".mjs"))) {
      continue;
    }
    if (SCENARIO_ENTRY.test(await readFile(entryPath, "utf8"))) {
      scenarios.push(entryPath);
    }
  }
  return scenarios.sort();
}

async function isAlive(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(ALIVE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function runScenarioProcess(entryPath, env) {
  const child = spawn(process.execPath, [entryPath], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(
        `${path.basename(entryPath)} exceeded ${SCENARIO_TIMEOUT_MS} ms; stopping it`,
      );
      stopProcessTree(child.pid);
    }, SCENARIO_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut });
    });
  });
}

const scenarios = await findScenarios();
if (scenarios.length === 0) throw new Error("No scenarios found");

let shared = null;
const stopShared = async (passed) => {
  const current = shared;
  shared = null;
  await current?.stop({ passed });
};
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopShared(false).finally(() => process.exit(1));
  });
}

const results = [];
try {
  for (const entryPath of scenarios) {
    if (!args.isolated && !(shared && (await isAlive(shared.port)))) {
      await stopShared(false);
      shared = await launchSharedScenarioInstance();
    }
    const startedAt = Date.now();
    const { code, timedOut } = await runScenarioProcess(entryPath, shared?.env);
    if (timedOut) await stopShared(false);
    results.push({
      scenario: path.basename(entryPath, ".mjs"),
      passed: code === 0,
      timedOut,
      ms: Date.now() - startedAt,
      memory: shared ? processTreeMemory(shared.pid) : null,
    });
  }
} finally {
  await stopShared(results.every((result) => result.passed));
}
console.log(JSON.stringify({ shared: !args.isolated, results }, null, 2));
process.exitCode = results.every((result) => result.passed) ? 0 : 1;
