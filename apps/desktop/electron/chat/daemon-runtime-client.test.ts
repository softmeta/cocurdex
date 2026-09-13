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
vi.mock("./owned-daemon-process", () => ({ spawnOwnedDaemonProcess: vi.fn() }));
const directories: string[] = [];
const clients: ReturnType<typeof createDaemonRuntimeClient>[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(process, "kill").mockReturnValue(true);
  vi.mocked(subscribeDaemonEvents).mockResolvedValue({ close: vi.fn() });
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.dispose()));
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cd-runtime-"));
  directories.push(directory);
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
  const shutdown = vi.fn().mockResolvedValue(undefined);
  vi.mocked(requestDaemon).mockImplementation(async (method) => {
    if (method === "daemon.shutdownIfIdle") {
      if (!busy) stopped = true;
      return {
        status: busy ? "busy" : "accepted",
        activeRequests: 0,
        activeWork: {
          agentTurns: busy ? 1 : 0,
          queuedInputs: 0,
          chatOperations: 0,
          workflowActive: false,
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
    return { pid: current.pid, shutdown };
  });
  const client = createDaemonRuntimeClient({
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
    shutdown,
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
    options?.onDiagnostic?.("stderr", "uncaught exception", "stderr");
    expect(logger.warn).toHaveBeenCalledWith("daemon.stderr", {
      message: "uncaught exception",
      stream: "stderr",
    });
    options?.onDiagnostic?.(
      "stdout",
      JSON.stringify({ level: "info", event: "ready", details: { value: 1 } }),
      "diagnostic",
    );
    expect(logger.info).toHaveBeenCalledWith("daemon.diagnostic", {
      message: "ready",
      stream: "stdout",
      details: { value: 1 },
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

  it.each([
    "TIMEOUT",
    "UNAUTHORIZED",
    "INVALID_RESPONSE",
  ])("preserves the incumbent when status fails with %s", async (code) => {
    const { client } = await fixture();
    vi.mocked(requestDaemon).mockRejectedValue(
      Object.assign(new Error(code), { code }),
    );
    await expect(client.initialize()).rejects.toThrow(code);
    expect(spawnOwnedDaemonProcess).not.toHaveBeenCalled();
    expect(process.kill).not.toHaveBeenCalled();
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
