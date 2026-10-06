import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const VOLATILE_KEYS = new Set([
  "agentInstanceId",
  "currentWorkingDirectory",
  "hostname",
  "mcpConfigPath",
]);
const TIMEOUT_MS = 20_000;

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/acp-probe.mjs <command> [...args]");
  console.error(
    "Example: node scripts/acp-probe.mjs grok --no-auto-update agent stdio",
  );
  process.exit(2);
}

function stable(value) {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => !VOLATILE_KEYS.has(key))
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

const cwd = mkdtempSync(path.join(tmpdir(), "cocurdex-acp-probe-"));
const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "ignore"] });
const finish = (code, output) => {
  child.kill("SIGKILL");
  rmSync(cwd, { recursive: true, force: true });
  if (output) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
  process.exit(code);
};
const timer = setTimeout(() => {
  console.error(`No initialize response within ${TIMEOUT_MS}ms`);
  finish(1);
}, TIMEOUT_MS);

child.on("error", (error) => {
  clearTimeout(timer);
  console.error(error.message);
  finish(1);
});

let buffered = "";
child.stdout.on("data", (chunk) => {
  buffered += chunk;
  const lines = buffered.split("\n");
  buffered = lines.pop() ?? "";
  for (const line of lines) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.id === 1) {
      clearTimeout(timer);
      finish(message.error ? 1 : 0, stable(message.result ?? message.error));
    }
  }
});

child.stdin.write(
  `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: "cocurdex-acp-probe", version: "0" },
    },
  })}\n`,
);
