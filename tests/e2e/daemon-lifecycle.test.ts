import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSocketTransport, requestDaemon } from "@cocurdex/daemon/client";
import { getDaemonMetadataPath } from "@cocurdex/daemon/paths";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import { createDaemonRpcClient } from "@cocurdex/rpc/client";
import { describe, expect, it } from "vitest";
import { spawnDaemon } from "./helpers/daemon-process";

describe("daemon process lifecycle", () => {
  it("publishes metadata and answers daemon.status over the socket", async () => {
    const daemon = await spawnDaemon();
    try {
      expect(daemon.metadata.pid).toBe(daemon.child.pid);
      expect(daemon.metadata.runtimeFingerprint).toBe("e2e-runtime");
      expect(daemon.metadata.protocolVersion).toBe(DAEMON_PROTOCOL_VERSION);
      expect(existsSync(daemon.metadata.socketPath)).toBe(true);

      const status = await requestDaemon("daemon.status", daemon.options);
      expect(status).toEqual({
        pid: daemon.child.pid,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        runtimeFingerprint: "e2e-runtime",
        socketPath: daemon.metadata.socketPath,
        startedAt: daemon.metadata.startedAt,
      });
    } finally {
      await daemon.dispose();
    }
  });

  it("rejects requests with an invalid token", async () => {
    const daemon = await spawnDaemon();
    try {
      const client = createDaemonRpcClient(
        createSocketTransport(daemon.metadata.socketPath),
        "wrong-token",
      );
      await expect(
        client.request("daemon.status", undefined),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    } finally {
      await daemon.dispose();
    }
  });

  it("refuses a second daemon on the same user data path", async () => {
    const first = await spawnDaemon();
    try {
      await expect(
        spawnDaemon({ userDataPath: first.userDataPath }),
      ).rejects.toThrow(/ownership/i);

      const status = await requestDaemon("daemon.status", first.options);
      expect(status.pid).toBe(first.child.pid);
    } finally {
      await first.dispose();
    }
  });

  it("accepts shutdownIfIdle for the matching daemon identity", async () => {
    const daemon = await spawnDaemon();
    const status = await requestDaemon("daemon.status", daemon.options);
    const result = await requestDaemon(
      "daemon.shutdownIfIdle",
      { pid: status.pid, startedAt: status.startedAt },
      daemon.options,
    );
    expect(result.status).toBe("accepted");

    expect(await daemon.exit).toBe(0);
    expect(existsSync(getDaemonMetadataPath(daemon.userDataPath))).toBe(false);
    await daemon.dispose();
  });

  it("rejects shutdownIfIdle for a stale daemon identity", async () => {
    const daemon = await spawnDaemon();
    try {
      const status = await requestDaemon("daemon.status", daemon.options);
      await expect(
        requestDaemon(
          "daemon.shutdownIfIdle",
          { pid: status.pid, startedAt: "1970-01-01T00:00:00.000Z" },
          daemon.options,
        ),
      ).rejects.toMatchObject({ code: "REQUEST_FAILED" });
    } finally {
      await daemon.dispose();
    }
  });

  it("persists data across restarts on the same user data path", async () => {
    const userDataPath = mkdtempSync(
      path.join(tmpdir(), "cocurdex-e2e-restart-"),
    );
    const first = await spawnDaemon({ userDataPath });
    const note = await requestDaemon(
      "note.create",
      { title: "Durable note" },
      first.options,
    );
    expect(await first.stop()).toBe(0);

    const second = await spawnDaemon({ userDataPath });
    try {
      const fetched = await requestDaemon(
        "note.get",
        { id: note.id },
        second.options,
      );
      expect(fetched).toMatchObject({ id: note.id, title: "Durable note" });
      expect(second.metadata.startedAt).not.toBe(first.metadata.startedAt);
    } finally {
      await second.dispose();
    }
  });

  it("recovers from a SIGKILLed daemon, keeping data and replacing stale metadata", async () => {
    const userDataPath = mkdtempSync(
      path.join(tmpdir(), "cocurdex-e2e-crash-"),
    );
    const first = await spawnDaemon({ userDataPath });
    const note = await requestDaemon(
      "note.create",
      { title: "Crash survivor" },
      first.options,
    );
    first.child.kill("SIGKILL");
    await first.exit;

    const second = await spawnDaemon({ userDataPath });
    try {
      expect(second.metadata.pid).toBe(second.child.pid);
      const fetched = await requestDaemon(
        "note.get",
        { id: note.id },
        second.options,
      );
      expect(fetched).toMatchObject({ id: note.id, title: "Crash survivor" });
    } finally {
      await second.dispose();
    }
  });
});
