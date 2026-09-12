import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { requestDaemon } from "./client";
import {
  getDaemonMetadataPath,
  getDaemonSocketPath,
  getDatabasePath,
} from "./paths";
import { startDaemonServer } from "./wire";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("startDaemonServer", () => {
  it("acknowledges editor view saves with a void result over real RPC", async () => {
    const userDataPath = await mkdtemp(path.join(os.tmpdir(), "cd-void-"));
    temporaryDirectories.push(userDataPath);
    const daemon = await startDaemonServer({
      runtimeFingerprint: "test",
      token: "test",
      userDataPath,
    });
    try {
      const timestamp = new Date().toISOString();
      await daemon.service.state.saveWorkspace({
        id: "workspace",
        name: "Test",
        rootPaths: [userDataPath],
        createdAt: timestamp,
        updatedAt: timestamp,
        lastOpenedAt: timestamp,
        sortOrder: 0,
      });
      await daemon.service.state.saveSession({
        id: "session",
        workspaceId: "workspace",
        title: "Test",
        agentType: "pi",
        status: "idle",
        writeMode: "read-only",
        collaborationMode: "default",
        createdAt: timestamp,
        updatedAt: timestamp,
        lastMessageAt: null,
      });
      const view = {
        sessionId: "session",
        openFiles: ["test.ts"],
        activeFile: "test.ts",
        selections: [],
      };
      await expect(
        requestDaemon(
          "storage.call",
          { operation: "editorView.save", args: [view] },
          { userDataPath },
        ),
      ).resolves.toBeUndefined();
      expect((await daemon.service.bootstrap()).editorViews).toContainEqual(
        view,
      );
    } finally {
      await daemon.close();
    }
  });
  it("closes owned resources and can be started again", async () => {
    const userDataPath = await mkdtemp(
      path.join(os.tmpdir(), "cocurdex-daemon-"),
    );
    temporaryDirectories.push(userDataPath);
    const first = await startDaemonServer({
      runtimeFingerprint: "first-runtime",
      token: "test-token",
      userDataPath,
    });

    try {
      await access(getDaemonMetadataPath(userDataPath));
      await expect(
        requestDaemon("daemon.status", { userDataPath }),
      ).resolves.toMatchObject({ runtimeFingerprint: "first-runtime" });
      expect(first.service.status().runtimeFingerprint).toBe("first-runtime");
      const close = (first as typeof first & { close?: () => Promise<void> })
        .close;

      expect(close).toBeTypeOf("function");
      await close?.();
      await close?.();

      await expect(
        access(getDaemonMetadataPath(userDataPath)),
      ).rejects.toThrow();
      if (process.platform !== "win32") {
        await expect(
          access(getDaemonSocketPath(userDataPath)),
        ).rejects.toThrow();
      }

      const second = await startDaemonServer({
        runtimeFingerprint: "second-runtime",
        token: "test-token",
        userDataPath,
      });
      expect(second.service.status().runtimeFingerprint).toBe("second-runtime");
      await (
        second as typeof second & { close?: () => Promise<void> }
      ).close?.();
    } finally {
      if (first.server.listening) {
        await new Promise<void>((resolve, reject) => {
          first.server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
    }
  });
});

async function createDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cd-wire-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function closeListener(server: net.Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

it("elects one daemon when startup races", async () => {
  const userDataPath = await createDirectory();
  const results = await Promise.allSettled(
    Array.from({ length: 3 }, (_, index) =>
      startDaemonServer({
        userDataPath,
        runtimeFingerprint: String(index),
        token: "test",
      }),
    ),
  );
  const winners = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  try {
    expect(winners).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(2);
  } finally {
    await Promise.all(winners.map((daemon) => daemon.close()));
  }
});

it("does not open the product database while an existing endpoint is live", async () => {
  const userDataPath = await createDirectory();
  const listener = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) =>
    listener.listen(getDaemonSocketPath(userDataPath), resolve),
  );
  try {
    await expect(
      startDaemonServer({
        userDataPath,
        runtimeFingerprint: "test",
        token: "test",
      }),
    ).rejects.toThrow("already running");
    await expect(access(getDatabasePath(userDataPath))).rejects.toThrow();
  } finally {
    await closeListener(listener);
  }
  const daemon = await startDaemonServer({
    userDataPath,
    runtimeFingerprint: "test",
    token: "test",
  });
  await daemon.close();
});

it("releases startup resources when metadata publication fails", async () => {
  const userDataPath = await createDirectory();
  const metadataPath = getDaemonMetadataPath(userDataPath);
  await mkdir(metadataPath);
  await expect(
    startDaemonServer({
      userDataPath,
      runtimeFingerprint: "test",
      token: "test",
    }),
  ).rejects.toThrow();
  await rm(metadataPath, { recursive: true });
  const daemon = await startDaemonServer({
    userDataPath,
    runtimeFingerprint: "test",
    token: "test",
  });
  await daemon.close();
});

it.skipIf(process.platform === "win32")(
  "does not unlink a replacement endpoint or metadata on shutdown",
  async () => {
    const userDataPath = await createDirectory();
    const daemon = await startDaemonServer({
      userDataPath,
      runtimeFingerprint: "test",
      token: "test",
    });
    const socketPath = getDaemonSocketPath(userDataPath);
    const metadataPath = getDaemonMetadataPath(userDataPath);
    const listener = net.createServer((socket) => socket.end());
    try {
      await unlink(socketPath);
      await new Promise<void>((resolve) =>
        listener.listen(socketPath, resolve),
      );
      const replacement = JSON.stringify({
        pid: process.pid,
        token: "replacement",
        startedAt: "replacement",
      });
      await writeFile(metadataPath, replacement);
      await daemon.close();
      await access(socketPath);
      expect(await readFile(metadataPath, "utf8")).toBe(replacement);
    } finally {
      await daemon.close();
      if (listener.listening) await closeListener(listener);
    }
  },
);

it("starts again through the canonical endpoint after an abrupt daemon exit", async () => {
  const userDataPath = await createDirectory();
  const moduleUrl = new URL("./wire.ts", import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import { startDaemonServer } from ${JSON.stringify(moduleUrl)};
    await startDaemonServer({ userDataPath: process.argv[1], token: "crashed", runtimeFingerprint: "crashed" });
    process.send("ready");
  `,
      userDataPath,
    ],
    { stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true },
  );
  const exited = once(child, "exit");
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Daemon fixture did not start")),
        10_000,
      );
      child.once("message", () => {
        clearTimeout(timer);
        resolve();
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Daemon fixture exited"));
      });
    });
    await expect(
      requestDaemon("daemon.status", { userDataPath }),
    ).resolves.toMatchObject({ runtimeFingerprint: "crashed" });
  } finally {
    child.kill("SIGKILL");
    await exited;
  }
  const successor = await startDaemonServer({
    userDataPath,
    runtimeFingerprint: "successor",
    token: "successor",
  });
  try {
    await expect(
      requestDaemon("daemon.status", { userDataPath }),
    ).resolves.toMatchObject({ runtimeFingerprint: "successor" });
  } finally {
    await successor.close();
  }
}, 20_000);
