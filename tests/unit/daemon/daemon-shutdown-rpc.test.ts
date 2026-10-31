import { requestDaemon } from "@cocurdex/daemon/internal/client";
import { startDaemonServer } from "@cocurdex/daemon/internal/wire";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();

const SHUTDOWN_TIMEOUT_MS = 10_000;

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
  await tempDirs.cleanup();
});

async function fixture() {
  const userDataPath = await tempDirs.create("cd-idle-");
  const onIdleShutdown = vi.fn();
  const daemon = await startDaemonServer({
    userDataPath,
    runtimeFingerprint: "test",
    token: "test",
    onIdleShutdown,
  });
  cleanups.push(async () => {
    await daemon.close();
  });
  await vi.waitFor(() =>
    expect(daemon.service.getActiveWork().workflowActive).toBe(false),
  );
  const status = daemon.service.status();
  const shutdown = () =>
    requestDaemon(
      "daemon.shutdownIfIdle",
      { pid: status.pid, startedAt: status.startedAt },
      { userDataPath },
    );
  return { daemon, shutdown, userDataPath, onIdleShutdown, status };
}

describe("daemon idle shutdown RPC", () => {
  it("confirms shutdown and closes an idle server", async () => {
    const { shutdown, onIdleShutdown, daemon } = await fixture();
    expect(await shutdown()).toMatchObject({
      status: "accepted",
      activeRequests: 0,
    });
    await vi.waitFor(() => expect(onIdleShutdown).toHaveBeenCalledOnce(), {
      timeout: SHUTDOWN_TIMEOUT_MS,
    });
    expect(daemon.server.listening).toBe(false);
  });

  it("rejects a stale process identity without closing the server", async () => {
    const { userDataPath, onIdleShutdown, status } = await fixture();
    await expect(
      requestDaemon(
        "daemon.shutdownIfIdle",
        { pid: status.pid, startedAt: "previous" },
        { userDataPath },
      ),
    ).rejects.toThrow("identity changed");
    expect(
      await requestDaemon("daemon.status", { userDataPath }),
    ).toMatchObject({ startedAt: status.startedAt });
    expect(onIdleShutdown).not.toHaveBeenCalled();
  });

  it("keeps a timed-out request protected until its server work settles", async () => {
    const { daemon, userDataPath, shutdown, onIdleShutdown } = await fixture();
    let finish!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const work = new Promise<[]>((resolve) => {
      finish = () => resolve([]);
    });
    vi.spyOn(daemon.service, "listWorkspaces").mockImplementation(() => {
      started();
      return work;
    });
    const result = expect(
      requestDaemon("workspace.list", { userDataPath, timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    try {
      await entered;
      await result;
      expect(await shutdown()).toMatchObject({
        status: "busy",
        activeRequests: 1,
      });
      expect(onIdleShutdown).not.toHaveBeenCalled();
    } finally {
      finish();
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(await shutdown()).toMatchObject({ status: "accepted" });
    await vi.waitFor(() => expect(onIdleShutdown).toHaveBeenCalledOnce(), {
      timeout: SHUTDOWN_TIMEOUT_MS,
    });
  });
});
