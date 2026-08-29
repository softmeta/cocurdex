import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeAllSessionLogs,
  configureSessionLogs,
  pruneSessionLogs,
  writeSessionLog,
} from "./session-log";

const DAY_MS = 24 * 60 * 60 * 1000;

async function flush() {
  // Allow the write stream to drain to disk before assertions.
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("session-log", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "cocurdex-session-"));
    configureSessionLogs({
      directory,
      retentionDays: 7,
      maxFiles: 100,
      idleTimeoutMs: 60_000,
    });
  });

  afterEach(async () => {
    await closeAllSessionLogs();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("writes entries for a session into a single timestamped file", async () => {
    writeSessionLog("session-1", JSON.stringify({ event: "first" }));
    writeSessionLog("session-1", JSON.stringify({ event: "second" }));
    await flush();
    await closeAllSessionLogs();

    const entries = await fs.readdir(directory);
    const sessionFiles = entries.filter((name) => name.includes("session-1"));
    expect(sessionFiles).toHaveLength(1);

    const content = await fs.readFile(
      path.join(directory, sessionFiles[0]),
      "utf8",
    );
    expect(content).toBe(
      `${JSON.stringify({ event: "first" })}\n${JSON.stringify({ event: "second" })}\n`,
    );
  });

  it("writes separate files for different sessions", async () => {
    writeSessionLog("session-a", "a");
    writeSessionLog("session-b", "b");
    await flush();
    await closeAllSessionLogs();

    const entries = await fs.readdir(directory);
    expect(entries.filter((n) => n.includes("session-a"))).toHaveLength(1);
    expect(entries.filter((n) => n.includes("session-b"))).toHaveLength(1);
  });

  it("prunes session files older than the retention window", async () => {
    const stalePath = path.join(directory, "2020-01-01T00-00-00-000Z-old.log");
    await fs.writeFile(stalePath, "old");
    const staleTime = new Date(Date.now() - 30 * DAY_MS);
    await fs.utimes(stalePath, staleTime, staleTime);

    const removed = await pruneSessionLogs();

    expect(removed).toContain(stalePath);
  });
});
