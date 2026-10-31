import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const writtenEntries: Record<string, unknown>[] = [];
const transportFailure = { active: false };

vi.mock("electron-log/main.js", () => {
  const scoped = {
    debug: (entry: Record<string, unknown>) => writtenEntries.push(entry),
    error: (entry: Record<string, unknown>) => {
      writtenEntries.push(entry);
      if (transportFailure.active) {
        console.error(new Error("Render frame was disposed"));
      }
    },
    info: (entry: Record<string, unknown>) => writtenEntries.push(entry),
    warn: (entry: Record<string, unknown>) => writtenEntries.push(entry),
  };
  return {
    default: {
      scope: () => scoped,
      transports: { console: {}, file: {}, ipc: {} },
    },
  };
});

import { readDiagnosticsPreferences } from "@desktop/electron/logging/diagnostics-preferences";
import {
  configureLogging,
  createUpstreamLogger,
  isDiagnosticsVerbose,
  setDiagnosticsVerbose,
  shutdownLogging,
} from "@desktop/electron/logging/logger";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

afterEach(async () => {
  await shutdownLogging();
  delete process.env.COCURDEX_DIAGNOSTICS;
});

async function makeLoggingContext() {
  const root = await tempDirs.create("cocurdex-logger-");
  const logDirectory = path.join(root, "logs");
  const sessionLogDirectory = path.join(logDirectory, "sessions");
  const diagnosticsPreferencesPath = path.join(
    root,
    "diagnostics-preferences.json",
  );
  await fs.mkdir(sessionLogDirectory, { recursive: true });
  configureLogging({
    appVersion: "1.0.0-test",
    diagnosticsPreferencesPath,
    logDirectory,
    sessionLogDirectory,
    verbose: false,
  });
  return { diagnosticsPreferencesPath };
}

describe("console capture", () => {
  it("does not feed console output raised while writing a log back into the log", async () => {
    await makeLoggingContext();
    writtenEntries.length = 0;
    transportFailure.active = true;
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      console.error("first failure");
    } finally {
      transportFailure.active = false;
      stderr.mockRestore();
    }

    expect(
      writtenEntries.filter((entry) => entry.event === "console.error"),
    ).toHaveLength(1);
  });
});

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
