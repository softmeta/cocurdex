import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const writtenEntries: Record<string, unknown>[] = [];

vi.mock("electron-log/main.js", () => {
  const scoped = {
    debug: (entry: Record<string, unknown>) => writtenEntries.push(entry),
    error: (entry: Record<string, unknown>) => writtenEntries.push(entry),
    info: (entry: Record<string, unknown>) => writtenEntries.push(entry),
    warn: (entry: Record<string, unknown>) => writtenEntries.push(entry),
  };
  return {
    default: {
      scope: () => scoped,
      transports: { console: {}, file: {} },
    },
  };
});

import { readDiagnosticsPreferences } from "./diagnostics-preferences";
import {
  configureLogging,
  createUpstreamLogger,
  exportDiagnostics,
  isDiagnosticsVerbose,
  setDiagnosticsVerbose,
  shutdownLogging,
} from "./logger";

const tempRoots: string[] = [];

afterEach(async () => {
  await shutdownLogging();
  delete process.env.COCURDEX_DIAGNOSTICS;
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function makeLoggingContext() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cocurdex-logger-"));
  tempRoots.push(root);
  const logDirectory = path.join(root, "logs");
  const sessionLogDirectory = path.join(logDirectory, "sessions");
  const diagnosticsDirectory = path.join(root, "diagnostics");
  const diagnosticsPreferencesPath = path.join(
    root,
    "diagnostics-preferences.json",
  );
  await fs.mkdir(sessionLogDirectory, { recursive: true });
  configureLogging({
    appVersion: "1.0.0-test",
    diagnosticsDirectory,
    diagnosticsPreferencesPath,
    logDirectory,
    sessionLogDirectory,
    verbose: false,
  });
  return { diagnosticsDirectory, diagnosticsPreferencesPath, logDirectory };
}

describe("createUpstreamLogger", () => {
  it("forwards third-party messages through log sanitization", () => {
    writtenEntries.length = 0;
    const upstream = createUpstreamLogger("updater");

    upstream.info(
      `downloaded update to ${os.homedir()}/Library/Caches/app/update.zip`,
    );
    upstream.error("request failed: authorization: bearer abc123token");

    expect(writtenEntries).toHaveLength(2);
    const [infoEntry, errorEntry] = writtenEntries;
    expect(infoEntry.event).toBe("upstream.log");
    expect(infoEntry.scope).toBe("updater");
    expect(infoEntry.level).toBe("info");
    const infoDetails = infoEntry.details as { message: string };
    expect(infoDetails.message).not.toContain(os.homedir());
    expect(infoDetails.message).toContain("~");
    const errorDetails = errorEntry.details as { message: string };
    expect(errorDetails.message).not.toContain("abc123token");
  });
});

describe("setDiagnosticsVerbose", () => {
  it("persists the preference and raises the file log level", async () => {
    const { diagnosticsPreferencesPath } = await makeLoggingContext();
    const log = (await import("electron-log/main.js")).default;

    setDiagnosticsVerbose(true);
    expect(isDiagnosticsVerbose()).toBe(true);
    expect(log.transports.file.level).toBe("debug");
    expect(readDiagnosticsPreferences(diagnosticsPreferencesPath).verbose).toBe(
      true,
    );

    setDiagnosticsVerbose(false);
    expect(isDiagnosticsVerbose()).toBe(false);
    expect(log.transports.file.level).toBe("info");
    expect(readDiagnosticsPreferences(diagnosticsPreferencesPath).verbose).toBe(
      false,
    );
  });
});

describe("exportDiagnostics", () => {
  it("re-sanitizes legacy log content and writes a summary", async () => {
    const { logDirectory } = await makeLoggingContext();
    const home = os.homedir();
    await fs.writeFile(
      path.join(logDirectory, "main-legacy.log"),
      [
        `stale line ${home}/secret-project token sk-abcdefghijklmnop1234`,
        JSON.stringify({
          event: "app.warning",
          level: "warn",
          scope: "app",
          timestamp: "2026-01-01T00:00:00.000Z",
        }),
        "",
      ].join("\n"),
    );

    const result = await exportDiagnostics({
      crashReports: [{ id: "dump-1", modifiedAt: "2026-01-01T00:00:00.000Z" }],
    });

    const exportedLog = await fs.readFile(
      path.join(result.outputPath, "main-legacy.log"),
      "utf8",
    );
    expect(exportedLog).not.toContain(home);
    expect(exportedLog).not.toContain("sk-abcdefghijklmnop1234");
    expect(exportedLog).toContain("app.warning");

    const metadata = JSON.parse(
      await fs.readFile(path.join(result.outputPath, "metadata.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(metadata.crashReports).toEqual([
      { id: "dump-1", modifiedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(metadata.appVersion).toBe("1.0.0-test");
    expect(typeof metadata.uptimeSeconds).toBe("number");

    const summary = JSON.parse(
      await fs.readFile(path.join(result.outputPath, "summary.json"), "utf8"),
    ) as {
      eventCounts: { event: string; count: number }[];
      levelCounts: Record<string, number>;
      recentProblems: { event: string }[];
    };
    expect(summary.levelCounts.warn).toBe(1);
    expect(summary.recentProblems[0]?.event).toBe("app.warning");
    expect(
      summary.eventCounts.some((entry) => entry.event === "app.warning"),
    ).toBe(true);
  });
});
