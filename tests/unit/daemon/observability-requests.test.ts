import { existsSync } from "node:fs";
import path from "node:path";
import { createDaemonHealthMonitor } from "@cocurdex/daemon/internal/daemon-health";
import { handleObservabilityRequest } from "@cocurdex/daemon/internal/observability-requests";
import type { DaemonRequest } from "@cocurdex/rpc";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

const device = {
  kind: "device" as const,
  deviceId: "d1",
  scopes: ["read" as const, "host.admin" as const],
};

async function observability() {
  const userDataPath = await tempDirs.create("cocu-obs-");
  let level: "debug" | "info" = "info";
  const health = createDaemonHealthMonitor({
    pid: process.pid,
    startedAt: "2026-10-24T00:00:00.000Z",
    databasePath: path.join(userDataPath, "cocurdex.sqlite"),
    activeRequests: () => 2,
    activeWork: () => ({
      agentTurns: 1,
      queuedInputs: 0,
      workflowActive: false,
      workspaceSearches: 0,
    }),
    connections: () => ({ total: 3, devices: 1 }),
    agentRuntimes: () => 4,
    terminals: () => 5,
    logLevel: () => level,
    logDirectory: path.join(userDataPath, "logs", "daemon"),
  });
  return {
    userDataPath,
    value: {
      status: () => ({
        hostId: "h",
        pid: process.pid,
        protocolVersion: 32,
        runtimeFingerprint: "unit",
        socketPath: "s",
        startedAt: "2026-10-24T00:00:00.000Z",
      }),
      health,
      logging: {
        directory: path.join(userDataPath, "logs", "daemon"),
        filePath: path.join(userDataPath, "logs", "daemon", "daemon.log"),
        level: () => level,
        setLevel: (next: "debug" | "info") => {
          level = next;
        },
        close: async () => undefined,
      },
      userDataPath,
    },
  };
}

function request(method: string, params?: unknown) {
  return {
    id: "r1",
    method,
    token: "t",
    ...(params === undefined ? {} : { params }),
  } as DaemonRequest;
}

describe("handleObservabilityRequest", () => {
  it("reports health counters and hides host paths from devices", async () => {
    const { value } = await observability();
    try {
      const local = (await handleObservabilityRequest(
        value,
        request("daemon.health"),
        { kind: "local" },
      )) as Awaited<ReturnType<typeof value.health.snapshot>>;
      const remote = (await handleObservabilityRequest(
        value,
        request("daemon.health"),
        device,
      )) as Awaited<ReturnType<typeof value.health.snapshot>>;

      expect(local).toMatchObject({
        activeRequests: 2,
        activeWork: { agentTurns: 1 },
        agentRuntimes: 4,
        connections: { total: 3, devices: 1 },
        database: { sizeBytes: null, walBytes: null },
        terminals: 5,
      });
      expect(local.memory.rssBytes).toBeGreaterThan(0);
      expect(local.logs.directory).toBe(value.logging.directory);
      expect(remote.logs.directory).toBeNull();
    } finally {
      value.health.stop();
    }
  });

  it("refuses host log directories from a device and writes nothing", async () => {
    const { value, userDataPath } = await observability();
    try {
      await expect(
        handleObservabilityRequest(
          value,
          request("diagnostics.export", {
            hostLogDirectories: [{ name: "etc", path: path.resolve("/etc") }],
          }),
          device,
        ),
      ).rejects.toThrow(/local host/);
      expect(existsSync(path.join(userDataPath, "diagnostics"))).toBe(false);
    } finally {
      value.health.stop();
    }
  });

  it("changes the daemon log level", async () => {
    const { value } = await observability();
    try {
      await expect(
        handleObservabilityRequest(
          value,
          request("diagnostics.logLevel.set", { level: "debug" }),
          { kind: "local" },
        ),
      ).resolves.toEqual({ level: "debug" });
      expect(value.logging.level()).toBe("debug");
      await expect(
        handleObservabilityRequest(
          value,
          request("diagnostics.logLevel.set", { level: "trace" }),
          { kind: "local" },
        ),
      ).rejects.toThrow(/Invalid diagnostics.logLevel.set payload/);
    } finally {
      value.health.stop();
    }
  });
});
