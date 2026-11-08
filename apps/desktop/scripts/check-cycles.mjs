#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = resolve(SCRIPT_DIR, "..");

const ALLOWED_CYCLES = [
  {
    reason: "subagent transcripts nest tool calls inside sessions",
    modules: [
      "features/agent/tool-call/tool-call-detail.tsx",
      "features/agent/tool-call/subagent-session-detail.tsx",
      "features/agent/view/chat-conversation-item.tsx",
      "features/agent/tool-call/tool-call-ui.tsx",
    ],
  },
];

function cycleKey(modules) {
  return [...modules].sort().join(" | ");
}

function runMadge() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "pnpm",
      [
        "dlx",
        "madge",
        "--circular",
        "--json",
        "--extensions",
        "ts,tsx",
        "--ts-config",
        "tsconfig.json",
        "src",
      ],
      { cwd: DESKTOP_ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", () => {
      try {
        resolvePromise(JSON.parse(stdout));
      } catch {
        reject(
          new Error(`madge produced no JSON output.\n${stderr || stdout}`),
        );
      }
    });
  });
}

const allowed = new Map(
  ALLOWED_CYCLES.map((entry) => [cycleKey(entry.modules), entry.reason]),
);
const cycles = await runMadge();
const unexpected = cycles.filter((cycle) => !allowed.has(cycleKey(cycle)));
const knownFound = cycles.length - unexpected.length;

if (unexpected.length === 0) {
  console.log(
    `No new circular dependencies (${knownFound}/${ALLOWED_CYCLES.length} known cycles present).`,
  );
  process.exit(0);
}

console.error(`Found ${unexpected.length} new circular dependency:`);
for (const cycle of unexpected) {
  console.error(`\n  ${cycle.join("\n  → ")}\n  → ${cycle[0]}`);
}
console.error(
  "\nBreak the cycle, or add it to ALLOWED_CYCLES in scripts/check-cycles.mjs with a reason.",
);
process.exit(1);
