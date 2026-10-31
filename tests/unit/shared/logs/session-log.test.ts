import fs from "node:fs/promises";
import path from "node:path";
import {
  createSessionLogWriter,
  type SessionLogWriter,
} from "@cocurdex/shared/node";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

const DAY_MS = 24 * 60 * 60 * 1000;
const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

describe("createSessionLogWriter", () => {
  let directory = "";
  let writer: SessionLogWriter;

  beforeEach(async () => {
    directory = await tempDirs.create("cocurdex-session-");
    writer = createSessionLogWriter({
      directory,
      retentionDays: 7,
      maxFiles: 100,
      idleTimeoutMs: 60_000,
    });
  });

  afterEach(async () => {
    await writer.closeAll();
  });

  it("writes entries for a session into a single timestamped file", async () => {
    writer.write("session-1", JSON.stringify({ event: "first" }));
    writer.write("session-1", JSON.stringify({ event: "second" }));
    await writer.closeAll();

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
    writer.write("session-a", "a");
    writer.write("session-b", "b");
    await writer.closeAll();

    const entries = await fs.readdir(directory);
    expect(entries.filter((n) => n.includes("session-a"))).toHaveLength(1);
    expect(entries.filter((n) => n.includes("session-b"))).toHaveLength(1);
  });

  it("prunes session files older than the retention window", async () => {
    const stalePath = path.join(directory, "2020-01-01T00-00-00-000Z-old.log");
    await fs.writeFile(stalePath, "old");
    const staleTime = new Date(Date.now() - 30 * DAY_MS);
    await fs.utimes(stalePath, staleTime, staleTime);

    expect(await writer.prune()).toContain(stalePath);
  });
});
