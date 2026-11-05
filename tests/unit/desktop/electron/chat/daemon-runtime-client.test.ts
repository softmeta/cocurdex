import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { createDaemonRuntimeClient } from "@desktop/electron/chat/daemon-runtime-client";
import { spawnOwnedDaemonProcess } from "@desktop/electron/chat/owned-daemon-process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();

vi.mock("@cocurdex/daemon/client", () => ({
  requestDaemon: vi.fn(),
  subscribeDaemonEvents: vi.fn(),
}));
vi.mock("@desktop/electron/chat/owned-daemon-process", () => ({
  spawnOwnedDaemonProcess: vi.fn(),
}));
const clients: ReturnType<typeof createDaemonRuntimeClient>[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(process, "kill").mockReturnValue(true);
  vi.mocked(subscribeDaemonEvents).mockResolvedValue({
    close: vi.fn(),
    epoch: null,
    lastSeq: null,
    replayGap: false,
    watchSessions: vi.fn().mockResolvedValue(undefined),
  });
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.dispose()));
  vi.restoreAllMocks();
  await tempDirs.cleanup();
});

async function fixture() {
  const directory = await tempDirs.create("cd-runtime-");
  const daemonEntryPath = path.join(directory, "daemon.cjs");
  const source = "current runtime";
  await writeFile(daemonEntryPath, source);
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const current = {
    pid: 456,
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    runtimeFingerprint: createHash("sha256").update(source).digest("hex"),
    socketPath: "/unused",
    startedAt: "current",
  };
  let status = {
    ...current,
    pid: 123,
    runtimeFingerprint: "old",
    startedAt: "old",
  };
  let stopped = false;
  let busy = false;
  let background = false;
  const shutdown = vi.fn().mockResolvedValue(undefined);
  const release = vi.fn();
  vi.mocked(requestDaemon).mockImplementation(async (method) => {
    if (method === "daemon.background.get") {
      return { enabled: background, available: true, registered: background };
    }
    if (method === "daemon.shutdownIfIdle") {
      if (!busy) stopped = true;
      return {
        status: busy ? "busy" : "accepted",
        activeRequests: 0,
        activeWork: {
          agentTurns: busy ? 1 : 0,
          queuedInputs: 0,
          workflowActive: false,
          workspaceSearches: 0,
        },
      };
    }
    if (stopped)
      throw Object.assign(new Error("not listening"), { code: "ECONNREFUSED" });
    return status;
  });
  vi.mocked(spawnOwnedDaemonProcess).mockImplementation(() => {
    stopped = false;
    status = current;
    return { pid: current.pid, release, shutdown };
  });
  const client = createDaemonRuntimeClient({
    appLaunchCommand: ["/Applications/Cocurdex.app/Contents/MacOS/Cocurdex"],
    daemonEntryPath,
    userDataPath: directory,
    logger,
    onEvent: vi.fn(),
  });
  clients.push(client);
  return {
    client,
    logger,
    current,
    release,
    shutdown,
    setBackground(value: boolean) {
      background = value;
    },
    setBusy(value: boolean) {
      busy = value;
    },
    setStatus(value: typeof status) {
      status = value;
    },
  };
}

describe("daemon runtime replacement", () => {
  it("requests atomic idle shutdown before replacing a different build", async () => {
    const { client, logger, current } = await fixture();
    await client.initialize();
    expect(process.kill).not.toHaveBeenCalled();
    expect(requestDaemon).toHaveBeenCalledWith(
      "daemon.shutdownIfIdle",
      { pid: 123, startedAt: "old" },
      expect.anything(),
    );
    expect(spawnOwnedDaemonProcess).toHaveBeenCalledOnce();
    expect(await client.getStatus()).toMatchObject({
      running: true,
      matchesRuntime: true,
      pid: current.pid,
    });
    const options = vi.mocked(spawnOwnedDaemonProcess).mock.calls[0]?.[0];
    options?.onOutput?.("stderr", "uncaught exception");
    expect(logger.warn).toHaveBeenCalledWith("daemon.stderr", {
      message: "uncaught exception",
      stream: "stderr",
    });
  });

  it("keeps a compatible busy daemon usable and upgrades after it becomes idle", async () => {
    const { client, setBusy } = await fixture();
    setBusy(true);
    await client.initialize();
    expect(spawnOwnedDaemonProcess).not.toHaveBeenCalled();
    expect(subscribeDaemonEvents).toHaveBeenCalledOnce();
    expect(await client.getStatus()).toMatchObject({
      running: true,
      matchesRuntime: false,
    });
    setBusy(false);
    await vi.waitFor(
      () => expect(spawnOwnedDaemonProcess).toHaveBeenCalledOnce(),
      { timeout: 5_000 },
    );
    expect(process.kill).not.toHaveBeenCalled();
  });

  it("does not use an incompatible busy daemon", async () => {
    const { client, current, setBusy, setStatus } = await fixture();
    setBusy(true);
    setStatus({ ...current, protocolVersion: DAEMON_PROTOCOL_VERSION - 1 });
    await expect(client.initialize()).rejects.toThrow("incompatible protocol");
    expect(spawnOwnedDaemonProcess).not.toHaveBeenCalled();
    expect(subscribeDaemonEvents).not.toHaveBeenCalled();
    expect(process.kill).not.toHaveBeenCalled();
  });

  it.each(["TIMEOUT", "UNAUTHORIZED", "INVALID_RESPONSE"])(
    "preserves the incumbent when status fails with %s",
    async (code) => {
      const { client } = await fixture();
      vi.mocked(requestDaemon).mockRejectedValue(
        Object.assign(new Error(code), { code }),
      );
      await expect(client.initialize()).rejects.toThrow(code);
      expect(spawnOwnedDaemonProcess).not.toHaveBeenCalled();
      expect(process.kill).not.toHaveBeenCalled();
    },
  );

  it("absorbs a settling initial probe before deciding the daemon is absent", async () => {
    const { client, current } = await fixture();
    let probes = 0;
    vi.mocked(requestDaemon).mockImplementation(async () => {
      probes += 1;
      if (probes === 1)
        throw Object.assign(new Error("Invalid daemon token"), {
          code: "UNAUTHORIZED",
        });
      return current;
    });
    await client.initialize();
    expect(probes).toBe(2);
    expect(spawnOwnedDaemonProcess).not.toHaveBeenCalled();
  });

  it("keeps polling while a spawned daemon publishes its token", async () => {
    const { client, current, shutdown } = await fixture();
    let spawned = false;
    const settling = ["UNAUTHORIZED", "DISCONNECTED", "TIMEOUT"];
    vi.mocked(requestDaemon).mockImplementation(async () => {
      if (!spawned)
        throw Object.assign(new Error("not listening"), {
          code: "ECONNREFUSED",
        });
      const code = settling.shift();
      if (code) throw Object.assign(new Error(code), { code });
      return current;
    });
    vi.mocked(spawnOwnedDaemonProcess).mockImplementation(() => {
      spawned = true;
      return { pid: current.pid, release: vi.fn(), shutdown };
    });
    await client.initialize();
    expect(settling).toHaveLength(0);
    expect(spawnOwnedDaemonProcess).toHaveBeenCalledOnce();
  });

  it("waits out transient disconnects while the incumbent shuts down", async () => {
    const { client, current, shutdown } = await fixture();
    const incumbent = {
      ...current,
      pid: 123,
      runtimeFingerprint: "old",
      startedAt: "old",
    };
    let stopping = false;
    let spawned = false;
    const settling = ["DISCONNECTED", "UNAUTHORIZED"];
    vi.mocked(requestDaemon).mockImplementation(async (method) => {
      if (method === "daemon.shutdownIfIdle") {
        stopping = true;
        return {
          status: "accepted",
          activeRequests: 0,
          activeWork: {
            agentTurns: 0,
            queuedInputs: 0,
            workflowActive: false,
            workspaceSearches: 0,
          },
        };
      }
      if (spawned) return current;
      if (!stopping) return incumbent;
      const code = settling.shift();
      if (code) throw Object.assign(new Error(code), { code });
      throw Object.assign(new Error("not listening"), {
        code: "ECONNREFUSED",
      });
    });
    vi.mocked(spawnOwnedDaemonProcess).mockImplementation(() => {
      spawned = true;
      return { pid: current.pid, release: vi.fn(), shutdown };
    });
    await client.initialize();
    expect(settling).toHaveLength(0);
    expect(spawnOwnedDaemonProcess).toHaveBeenCalledOnce();
  });

  it("does not force replacement when safe shutdown is unsupported", async () => {
    const { client, current } = await fixture();
    vi.mocked(requestDaemon).mockImplementation(async (method) => {
      if (method === "daemon.shutdownIfIdle")
        throw new Error("Unsupported daemon method");
      return { ...current, runtimeFingerprint: "old" };
    });
    await expect(client.initialize()).rejects.toThrow(
      "Unsupported daemon method",
    );
    expect(spawnOwnedDaemonProcess).not.toHaveBeenCalled();
    expect(process.kill).not.toHaveBeenCalled();
  });

  it("merges simultaneous initialization without duplicate startup or subscriptions", async () => {
    const { client } = await fixture();
    await Promise.all([
      client.initialize(),
      client.initialize(),
      client.initialize(),
    ]);
    expect(spawnOwnedDaemonProcess).toHaveBeenCalledOnce();
    expect(subscribeDaemonEvents).toHaveBeenCalledOnce();
  });

  it("reports status without starting a daemon", async () => {
    const { client, current, setStatus } = await fixture();
    setStatus(current);
    expect(await client.getStatus()).toMatchObject({
      running: true,
      matchesRuntime: true,
      ownedByThisApp: false,
    });
    expect(spawnOwnedDaemonProcess).not.toHaveBeenCalled();
  });

  it("refuses explicit restart while the owned daemon is busy", async () => {
    const { client, setBusy, shutdown } = await fixture();
    await client.initialize();
    setBusy(true);
    await expect(client.restart()).rejects.toThrow("busy");
    expect(shutdown).not.toHaveBeenCalled();
    expect(spawnOwnedDaemonProcess).toHaveBeenCalledOnce();
    expect(process.kill).not.toHaveBeenCalled();
  });

  it("restarts an idle owned daemon through the same safe protocol", async () => {
    const { client, shutdown } = await fixture();
    await client.initialize();
    expect(await client.restart()).toMatchObject({
      running: true,
      matchesRuntime: true,
    });
    expect(shutdown).toHaveBeenCalledOnce();
    expect(spawnOwnedDaemonProcess).toHaveBeenCalledTimes(2);
    expect(process.kill).not.toHaveBeenCalled();
  });

  it("leaves an owned daemon running on quit when background mode is on", async () => {
    const { client, release, setBackground, shutdown } = await fixture();
    await client.initialize();
    setBackground(true);
    await client.dispose();
    expect(release).toHaveBeenCalledOnce();
    expect(shutdown).not.toHaveBeenCalled();
  });

  it("stops an owned daemon on quit when background mode is off", async () => {
    const { client, release, shutdown } = await fixture();
    await client.initialize();
    await client.dispose();
    expect(shutdown).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
  });

  it("asks an adopted daemon to stop when idle on quit once background mode is off", async () => {
    const { client, current, setStatus } = await fixture();
    setStatus(current);
    await client.initialize();
    expect(spawnOwnedDaemonProcess).not.toHaveBeenCalled();
    await client.dispose();
    expect(requestDaemon).toHaveBeenCalledWith(
      "daemon.shutdownIfIdle",
      { pid: current.pid, startedAt: current.startedAt },
      expect.anything(),
    );
  });

  it("does not spawn after disposal during status lookup", async () => {
    const { client } = await fixture();
    let reject!: (error: Error) => void;
    vi.mocked(requestDaemon).mockImplementation(
      () =>
        new Promise((_, rejectRequest) => {
          reject = rejectRequest;
        }),
    );
    const initializing = expect(client.initialize()).rejects.toThrow();
    await vi.waitFor(() => expect(requestDaemon).toHaveBeenCalled());
    const disposing = client.dispose();
    reject(Object.assign(new Error("unavailable"), { code: "ENOENT" }));
    await Promise.all([initializing, disposing]);
    expect(spawnOwnedDaemonProcess).not.toHaveBeenCalled();
  });
});
