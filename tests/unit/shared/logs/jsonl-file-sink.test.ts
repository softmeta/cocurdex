import fs from "node:fs/promises";
import path from "node:path";
import {
  createJsonlFileSink,
  createLogger,
  createSessionLogWriter,
  installLogSink,
  type LogRecord,
} from "@cocurdex/shared/node";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

function record(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    timestamp: "2026-10-24T00:00:00.000Z",
    level: "info",
    scope: "test",
    event: "test.event",
    pid: 1,
    ...overrides,
  };
}

async function readLines(filePath: string) {
  const content = await fs.readFile(filePath, "utf8");
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogRecord);
}

describe("createJsonlFileSink", () => {
  it("appends one JSON record per line and filters by level", async () => {
    const directory = await tempDirs.create("cocu-sink-");
    const sink = createJsonlFileSink({
      directory,
      fileName: "daemon.log",
      maxBytes: 1024 * 1024,
      retentionDays: 7,
      maxArchives: 10,
      minimumLevel: "info",
    });

    expect(sink.accepts("debug")).toBe(false);
    sink.write(record({ event: "first" }));
    sink.write(record({ event: "second", level: "error" }));
    sink.setMinimumLevel("debug");
    expect(sink.accepts("debug")).toBe(true);
    await sink.close();

    const lines = await readLines(path.join(directory, "daemon.log"));
    expect(lines.map((line) => line.event)).toEqual(["first", "second"]);
  });

  it("rotates the active file into a timestamped archive past the size limit", async () => {
    const directory = await tempDirs.create("cocu-sink-");
    const sink = createJsonlFileSink({
      directory,
      fileName: "daemon.log",
      maxBytes: 400,
      retentionDays: 7,
      maxArchives: 10,
      minimumLevel: "info",
    });

    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-01-01T00:00:00Z"),
    });
    try {
      for (let index = 0; index < 10; index += 1) {
        sink.write(record({ event: `event-${index}` }));
      }
    } finally {
      vi.useRealTimers();
    }
    await sink.close();

    const names = await fs.readdir(directory);
    const archives = names.filter((name) => /^daemon-.+\.log$/.test(name));
    expect(archives.length).toBeGreaterThan(0);
    const active = await fs.stat(path.join(directory, "daemon.log"));
    expect(active.size).toBeLessThanOrEqual(400);
    const events = (
      await Promise.all(
        names.map((name) => readLines(path.join(directory, name))),
      )
    )
      .flat()
      .map((line) => line.event)
      .sort();
    expect(events).toHaveLength(10);
  });

  it("keeps at most the configured number of archives", async () => {
    const directory = await tempDirs.create("cocu-sink-");
    const sink = createJsonlFileSink({
      directory,
      fileName: "daemon.log",
      maxBytes: 1,
      retentionDays: 7,
      maxArchives: 2,
      minimumLevel: "info",
    });

    for (let index = 0; index < 6; index += 1) {
      sink.write(record({ event: `event-${index}` }));
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await sink.close();

    const archives = (await fs.readdir(directory)).filter((name) =>
      /^daemon-.+\.log$/.test(name),
    );
    expect(archives).toHaveLength(2);
  });

  it("fans records that carry a session id out to that session's file", async () => {
    const directory = await tempDirs.create("cocu-sink-");
    const sessionDirectory = path.join(directory, "sessions");
    const sink = createJsonlFileSink({
      directory,
      fileName: "daemon.log",
      maxBytes: 1024 * 1024,
      retentionDays: 7,
      maxArchives: 10,
      minimumLevel: "info",
      sessionLogs: createSessionLogWriter({
        directory: sessionDirectory,
        retentionDays: 7,
        maxFiles: 10,
        idleTimeoutMs: 60_000,
      }),
    });

    sink.write(record({ event: "turn", details: { sessionId: "s-1" } }));
    sink.write(record({ event: "global" }));
    await sink.close();

    const [sessionFile] = await fs.readdir(sessionDirectory);
    expect(sessionFile).toContain("s-1");
    const sessionLines = await readLines(
      path.join(sessionDirectory, sessionFile),
    );
    expect(sessionLines.map((line) => line.event)).toEqual(["turn"]);
  });
});

describe("createLogger", () => {
  it("sanitizes details before they reach the installed sink", () => {
    const records: LogRecord[] = [];
    const restore = installLogSink({
      accepts: (level) => level !== "debug",
      write: (entry) => records.push(entry),
    });
    try {
      const logger = createLogger("unit");
      logger.debug("hidden.event");
      logger.warn("visible.event", { apiKey: "secret", count: 2 });
    } finally {
      restore();
    }

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      scope: "unit",
      event: "visible.event",
      level: "warn",
      details: { apiKey: "[redacted]", count: 2 },
    });
  });
});
