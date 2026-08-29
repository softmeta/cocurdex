import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDaemonRuntimeClient } from "./daemon-runtime-client";
import { spawnOwnedDaemonProcess } from "./owned-daemon-process";

vi.mock("@cocurdex/daemon/client", () => ({
  requestDaemon: vi.fn(),
  subscribeDaemonEvents: vi.fn(),
}));

vi.mock("./owned-daemon-process", () => ({
  spawnOwnedDaemonProcess: vi.fn(),
}));

const temporaryDirectories: string[] = [];

beforeEach(() => {
  vi.mocked(spawnOwnedDaemonProcess).mockReturnValue({
    pid: 456,
    shutdown: vi.fn().mockResolvedValue(undefined),
  });
  vi.mocked(subscribeDaemonEvents).mockResolvedValue({
    close: vi.fn(),
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("createDaemonRuntimeClient", () => {
  it("replaces a daemon from a different runtime build", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cocurdex-daemon-runtime-"),
    );
    temporaryDirectories.push(directory);
    const daemonEntryPath = path.join(directory, "daemon.cjs");
    const daemonSource = "console.log('current daemon');";
    await writeFile(daemonEntryPath, daemonSource);
    const currentFingerprint = createHash("sha256")
      .update(daemonSource)
      .digest("hex");
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    vi.mocked(requestDaemon)
      .mockResolvedValueOnce({
        pid: 123,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: "outdated-runtime",
        socketPath: "/tmp/cocurdex-daemon.sock",
        startedAt: "2026-07-25T00:00:00.000Z",
      })
      .mockRejectedValueOnce(new Error("daemon exited"))
      .mockResolvedValueOnce({
        pid: 456,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: currentFingerprint,
        socketPath: "/tmp/cocurdex-daemon.sock",
        startedAt: "2026-07-30T00:00:00.000Z",
      });
    const client = createDaemonRuntimeClient({
      daemonEntryPath,
      logger,
      onEvent: vi.fn(),
      userDataPath: directory,
    });

    await client.initialize();

    expect(kill).toHaveBeenCalledWith(123, "SIGTERM");
    expect(spawnOwnedDaemonProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        daemonEntryPath,
        runtimeFingerprint: currentFingerprint,
      }),
    );
    const spawnOptions = vi.mocked(spawnOwnedDaemonProcess).mock.calls[0]?.[0];
    spawnOptions?.onDiagnostic?.(
      "stdout",
      '{"event":"pi.skills.scanned","skillCount":0}',
    );
    expect(logger.info).toHaveBeenCalledWith("daemon.diagnostic", {
      message: '{"event":"pi.skills.scanned","skillCount":0}',
      stream: "stdout",
    });

    spawnOptions?.onDiagnostic?.(
      "stderr",
      JSON.stringify({
        details: { attempts: 2 },
        event: "daemon.startFailed",
        level: "warn",
      }),
      "diagnostic",
    );
    expect(logger.warn).toHaveBeenCalledWith("daemon.diagnostic", {
      details: { attempts: 2 },
      message: "daemon.startFailed",
      stream: "stderr",
    });

    spawnOptions?.onDiagnostic?.("stderr", "uncaught exception", "stderr");
    expect(logger.warn).toHaveBeenCalledWith("daemon.stderr", {
      message: "uncaught exception",
      stream: "stderr",
    });
  });

  it("reports daemon status without starting a process", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cocurdex-daemon-status-"),
    );
    temporaryDirectories.push(directory);
    const daemonEntryPath = path.join(directory, "daemon.cjs");
    const daemonSource = "console.log('status daemon');";
    await writeFile(daemonEntryPath, daemonSource);
    const currentFingerprint = createHash("sha256")
      .update(daemonSource)
      .digest("hex");
    vi.mocked(requestDaemon).mockResolvedValueOnce({
      pid: 321,
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      runtimeFingerprint: currentFingerprint,
      socketPath: "/tmp/cocurdex-daemon.sock",
      startedAt: "2026-07-30T12:00:00.000Z",
    });
    const client = createDaemonRuntimeClient({
      daemonEntryPath,
      logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
      onEvent: vi.fn(),
      userDataPath: directory,
    });

    const status = await client.getStatus();

    expect(status).toMatchObject({
      running: true,
      pid: 321,
      matchesRuntime: true,
      ownedByThisApp: false,
      socketPath: "/tmp/cocurdex-daemon.sock",
      error: null,
    });
    expect(spawnOwnedDaemonProcess).not.toHaveBeenCalled();
  });

  it("restarts by shutting down the owned process and ensuring a new daemon", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cocurdex-daemon-restart-"),
    );
    temporaryDirectories.push(directory);
    const daemonEntryPath = path.join(directory, "daemon.cjs");
    const daemonSource = "console.log('restart daemon');";
    await writeFile(daemonEntryPath, daemonSource);
    const currentFingerprint = createHash("sha256")
      .update(daemonSource)
      .digest("hex");
    const shutdown = vi.fn().mockResolvedValue(undefined);
    vi.mocked(spawnOwnedDaemonProcess).mockReturnValue({
      pid: 456,
      shutdown,
    });
    vi.mocked(requestDaemon)
      .mockResolvedValueOnce({
        pid: 123,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: currentFingerprint,
        socketPath: "/tmp/cocurdex-daemon.sock",
        startedAt: "2026-07-30T00:00:00.000Z",
      })
      .mockRejectedValueOnce(new Error("daemon stopped"))
      .mockResolvedValueOnce({
        pid: 456,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: currentFingerprint,
        socketPath: "/tmp/cocurdex-daemon.sock",
        startedAt: "2026-07-30T01:00:00.000Z",
      })
      .mockResolvedValueOnce({
        pid: 456,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: currentFingerprint,
        socketPath: "/tmp/cocurdex-daemon.sock",
        startedAt: "2026-07-30T01:00:00.000Z",
      });
    const client = createDaemonRuntimeClient({
      daemonEntryPath,
      logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
      onEvent: vi.fn(),
      userDataPath: directory,
    });

    // First call path in ensureDaemon hits matching status; force ownership by
    // initializing once with a non-matching status so spawn records ownership.
    vi.mocked(requestDaemon).mockReset();
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    vi.mocked(requestDaemon)
      .mockResolvedValueOnce({
        pid: 99,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: "old",
        socketPath: "/tmp/cocurdex-daemon.sock",
        startedAt: "2026-07-30T00:00:00.000Z",
      })
      .mockRejectedValueOnce(new Error("exited"))
      .mockResolvedValueOnce({
        pid: 456,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: currentFingerprint,
        socketPath: "/tmp/cocurdex-daemon.sock",
        startedAt: "2026-07-30T00:30:00.000Z",
      });
    await client.initialize();
    expect(kill).toHaveBeenCalled();
    expect(spawnOwnedDaemonProcess).toHaveBeenCalled();

    vi.mocked(requestDaemon).mockReset();
    vi.mocked(requestDaemon)
      .mockResolvedValueOnce({
        pid: 789,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: currentFingerprint,
        socketPath: "/tmp/cocurdex-daemon.sock",
        startedAt: "2026-07-30T01:00:00.000Z",
      })
      .mockResolvedValueOnce({
        pid: 789,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: currentFingerprint,
        socketPath: "/tmp/cocurdex-daemon.sock",
        startedAt: "2026-07-30T01:00:00.000Z",
      });

    const status = await client.restart();

    expect(shutdown).toHaveBeenCalled();
    expect(status).toMatchObject({
      running: true,
      pid: 789,
      matchesRuntime: true,
      ownedByThisApp: false,
    });
  });
});
