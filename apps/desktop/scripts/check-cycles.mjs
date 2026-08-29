#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = resolve(SCRIPT_DIR, "..");

/**
 * Cycles that are known and accepted, so the check can stay zero-tolerance for
 * everything else. Each entry is the module list madge reports, in any
 * rotation. Only add one with a reason — the point of this list is that it
 * stays short.
 */
const ALLOWED_CYCLES = [
  {
    // Recursive UI mirroring recursive data: a session renders tool calls, a
    // tool call may be a subagent, and that subagent renders a session. React
    // resolves the components at render time, so the cycle never produces an
    // undefined module. Breaking it would mean injecting the component through
    // a registry, which trades readability for a green check.
    reason: "subagent transcripts nest tool calls inside sessions",
    modules: [
      "features/agent/tool-call/tool-call-detail.tsx",
      "features/agent/tool-call/subagent-session-detail.tsx",
      "features/agent/view/chat-conversation-item.tsx",
      "features/agent/tool-call/tool-call-ui.tsx",
    ],
  },
];

// A cycle has no natural starting point, so compare it as an unordered set.
function cycleKey(modules) {
  return [...modules].sort().join(" | ");
}

function runMadge() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "pnpm",
      ["dlx", "madge", "--circular", "--json", "--extensions", "ts,tsx", "src"],
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
    // madge exits non-zero when it finds cycles, which is the normal path here;
    // only a missing/broken run (no parseable JSON) is a real failure.
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
