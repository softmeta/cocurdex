import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  diagnosticsSectionName,
  exportDaemonDiagnostics,
} from "@cocurdex/daemon/internal/diagnostics-export";
import type { DaemonHealth, DaemonStatus } from "@cocurdex/rpc";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

const status: DaemonStatus = {
  hostId: "host-1",
  pid: 42,
  protocolVersion: 32,
  runtimeFingerprint: "unit",
  socketPath: "/run/cocurdex.sock",
  startedAt: "2026-10-24T00:00:00.000Z",
};

const health = {
  pid: 42,
  uptimeSeconds: 10,
  logs: { level: "info", directory: null },
} as unknown as DaemonHealth;

async function seedLogs(directory: string, lines: string[]) {
  await fs.mkdir(path.join(directory, "sessions"), { recursive: true });
  await fs.writeFile(
    path.join(directory, "daemon.log"),
    `${lines.join("\n")}\n`,
  );
}

describe("exportDaemonDiagnostics", () => {
  it("bundles daemon and host logs with redaction, metadata, and a summary", async () => {
    const userDataPath = await tempDirs.create("cocu-diag-");
    const daemonLogs = path.join(userDataPath, "logs", "daemon");
    const hostLogs = await tempDirs.create("cocu-diag-host-");
    await seedLogs(daemonLogs, [
      JSON.stringify({ event: "rpc.failed", level: "warn", scope: "daemon" }),
    ]);
    await fs.writeFile(
      path.join(hostLogs, "main.log"),
      `opened ${os.homedir()}/private token sk-abcdefghijklmnop1234\n`,
    );

    const result = await exportDaemonDiagnostics({
      userDataPath,
      daemonLogDirectory: daemonLogs,
      status,
      health,
      input: {
        hostLogDirectories: [{ name: "desktop", path: hostLogs }],
        hostMetadata: { appVersion: "1.2.3", apiKey: "secret" },
      },
      now: new Date("2026-10-24T01:02:03.000Z"),
    });

    expect(result.outputPath).toBe(
      path.join(
        userDataPath,
        "diagnostics",
        "cocurdex-diagnostics-2026-10-24T01-02-03-000Z",
      ),
    );
    const hostLog = await fs.readFile(
      path.join(result.outputPath, "desktop", "main.log"),
      "utf8",
    );
    expect(hostLog).not.toContain(os.homedir());
    expect(hostLog).not.toContain("sk-abcdefghijklmnop1234");
    const metadata = JSON.parse(
      await fs.readFile(path.join(result.outputPath, "metadata.json"), "utf8"),
    );
    expect(metadata.daemon.status.pid).toBe(42);
    expect(metadata.daemon.status).not.toHaveProperty("socketPath");
    expect(metadata.host).toEqual({
      appVersion: "1.2.3",
      apiKey: "[redacted]",
    });
    const summary = JSON.parse(
      await fs.readFile(path.join(result.outputPath, "summary.json"), "utf8"),
    );
    expect(summary.recentProblems).toEqual([
      expect.objectContaining({ event: "rpc.failed", level: "warn" }),
    ]);
    expect(result.fileCount).toBe(4);
  });

  it("keeps only the ten newest bundles", async () => {
    const userDataPath = await tempDirs.create("cocu-diag-");
    const daemonLogs = path.join(userDataPath, "logs", "daemon");
    await seedLogs(daemonLogs, []);
    for (let index = 0; index < 12; index += 1) {
      await exportDaemonDiagnostics({
        userDataPath,
        daemonLogDirectory: daemonLogs,
        status,
        health,
        input: {},
        now: new Date(Date.UTC(2026, 9, 24, 0, 0, index)),
      });
    }

    const bundles = await fs.readdir(path.join(userDataPath, "diagnostics"));
    expect(bundles).toHaveLength(10);
    expect(bundles.sort()[0]).toBe(
      "cocurdex-diagnostics-2026-10-24T00-00-02-000Z",
    );
  });
});

describe("diagnosticsSectionName", () => {
  it("keeps host sections apart from the daemon section", () => {
    expect(diagnosticsSectionName("Desktop App")).toBe("desktop-app");
    expect(diagnosticsSectionName("daemon")).toBe("host-daemon");
    expect(diagnosticsSectionName("../..")).toBe("host-logs");
  });
});
