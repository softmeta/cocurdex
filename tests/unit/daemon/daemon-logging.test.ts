import fs from "node:fs/promises";
import path from "node:path";
import { configureDaemonLogging } from "@cocurdex/daemon/internal/daemon-logging";
import { logDaemonDiagnostic } from "@cocurdex/daemon/internal/diagnostics";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

describe("configureDaemonLogging", () => {
  it("writes daemon and captured console records to the daemon log", async () => {
    const userDataPath = await tempDirs.create("cocu-dlog-");
    const originalWarn = console.warn;
    const logging = configureDaemonLogging({
      userDataPath,
      env: { COCURDEX_DIAGNOSTICS: "0" },
    });
    try {
      logDaemonDiagnostic("info", "daemon.started", { sessionId: "s-9" });
      logDaemonDiagnostic("debug", "daemon.hidden");
      console.warn("third-party warning", { token: "abc" });
    } finally {
      await logging.close();
    }

    expect(console.warn).toBe(originalWarn);
    expect(logging.directory).toBe(path.join(userDataPath, "logs", "daemon"));
    const lines = (await fs.readFile(logging.filePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines.map((line) => line.event)).toEqual([
      "daemon.started",
      "console.warn",
    ]);
    expect(lines[1]).toMatchObject({
      level: "warn",
      scope: "console",
      details: {
        message: "third-party warning",
        args: [{ token: "[redacted]" }],
      },
    });
    const sessionFiles = await fs.readdir(
      path.join(logging.directory, "sessions"),
    );
    expect(sessionFiles).toEqual([expect.stringContaining("s-9")]);
  });
});
