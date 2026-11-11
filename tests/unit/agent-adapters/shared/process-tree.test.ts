import { spawn } from "node:child_process";
import {
  collectDescendantPids,
  shutdownChildProcess,
} from "@cocurdex/agent-adapters/internal/shared/process-tree";
import { describe, expect, it } from "vitest";

describe("collectDescendantPids", () => {
  it("walks every generation below the root and nothing beside it", () => {
    const table = [
      "    1     0",
      "  100     1",
      "  200   100",
      "  201   100",
      "  300   200",
      "  999     1",
      "",
    ].join("\n");

    expect(collectDescendantPids(table, 100).sort()).toEqual([200, 201, 300]);
  });

  it("returns nothing for a process without children", () => {
    expect(collectDescendantPids("  100     1\n", 100)).toEqual([]);
  });

  it("ignores malformed rows and parent cycles", () => {
    const table = ["garbage", "  100   1", "  200   100", "  100   200"].join(
      "\n",
    );

    expect(collectDescendantPids(table, 100)).toEqual([200]);
  });
});

function spawnNode(script: string) {
  const child = spawn(process.execPath, ["-e", script], {
    stdio: ["pipe", "pipe", "ignore"],
  });
  const ready = new Promise<void>((resolve) =>
    child.stdout.once("data", () => resolve()),
  );
  return { child, ready };
}

const FAST = { eofGraceMs: 200, sigtermGraceMs: 200 };

describe("shutdownChildProcess", () => {
  it("lets a process exit on its own when its input closes", async () => {
    const { child, ready } = spawnNode(
      "process.stdin.on('end', () => process.exit(0)); process.stdin.resume(); console.log('ready')",
    );
    await ready;

    await shutdownChildProcess(child, FAST);

    expect(child.exitCode).toBe(0);
  });

  it("kills a process that ignores both its input closing and SIGTERM", async () => {
    const { child, ready } = spawnNode(
      "process.on('SIGTERM', () => {}); process.stdin.resume(); setInterval(() => {}, 1000); console.log('ready')",
    );
    await ready;

    await shutdownChildProcess(child, FAST);

    await expect
      .poll(() => child.exitCode !== null || child.signalCode !== null)
      .toBe(true);
  });
});
