import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DaemonMetadata } from "@cocurdex/rpc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestDaemon, subscribeDaemonEvents } from "./client";
import { daemonRequestTimeout } from "./client-timeout";
import { getDaemonSocketPath } from "./paths";

const cleanups: (() => Promise<void>)[] = [];
async function serve(
  respond: (socket: net.Socket, request: { id: string }) => void,
) {
  const directory = await mkdtemp(path.join(tmpdir(), "cd-rpc-"));
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    socket.once("data", (data) => respond(socket, JSON.parse(data.toString())));
  });
  const socketPath = getDaemonSocketPath(directory);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  cleanups.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const metadata: DaemonMetadata = {
    socketPath,
    token: "test",
    pid: process.pid,
    startedAt: "test",
    protocolVersion: 19,
    runtimeFingerprint: "test",
  };
  return { metadata, sockets };
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("daemon request transport", () => {
  it("rejects close without a response", async () => {
    const { metadata } = await serve((socket) => socket.end());
    await expect(
      requestDaemon("daemon.status", { metadata }),
    ).rejects.toMatchObject({ code: "DISCONNECTED" });
  });
  it("bounds an unanswered request and releases its connection", async () => {
    const { metadata, sockets } = await serve(() => {});
    await expect(
      requestDaemon("daemon.status", { metadata, timeoutMs: 30 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.waitFor(() => expect(sockets.size).toBe(0));
  });
  it.each([
    "not-json\n",
    "null\n",
    "[]\n",
  ])("rejects malformed wire data %s", async (data) => {
    const { metadata } = await serve((socket) => socket.write(data));
    await expect(
      requestDaemon("daemon.status", { metadata }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("keeps framing and request identity when responses are fragmented", async () => {
    const { metadata } = await serve((socket, request) => {
      socket.write(`${JSON.stringify({ id: "other", result: "wrong" })}\n`);
      const response = `${JSON.stringify({ id: request.id, result: { pid: 42 } })}\n`;
      socket.write(response.slice(0, 8));
      socket.end(response.slice(8));
    });
    await expect(requestDaemon("daemon.status", { metadata })).resolves.toEqual(
      { pid: 42 },
    );
  });
  it("accepts successful void results omitted by JSON serialization", async () => {
    const { metadata } = await serve((socket, request) =>
      socket.end(`${JSON.stringify({ id: request.id, result: undefined })}\n`),
    );
    await expect(
      requestDaemon("session.delete", { sessionId: "session-1" }, { metadata }),
    ).resolves.toBeUndefined();
  });
  it("still rejects malformed server errors", async () => {
    const { metadata } = await serve((socket, request) =>
      socket.end(`${JSON.stringify({ id: request.id, error: {} })}\n`),
    );
    await expect(
      requestDaemon("daemon.status", { metadata }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("preserves server error codes", async () => {
    const { metadata } = await serve((socket, request) =>
      socket.end(
        `${JSON.stringify({
          id: request.id,
          error: { code: "UNAUTHORIZED", message: "Denied" },
        })}\n`,
      ),
    );
    await expect(
      requestDaemon("daemon.status", { metadata }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Denied" });
  });
  it("supports local cancellation without retrying the operation", async () => {
    const controller = new AbortController();
    const respond = vi.fn(() => controller.abort());
    const { metadata, sockets } = await serve(respond);
    await expect(
      requestDaemon("daemon.status", { metadata, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(respond).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(sockets.size).toBe(0));
  });
  it("gives setup operations a longer bounded budget", () => {
    expect(daemonRequestTimeout("workspace.runWorktreeSetup")).toBeGreaterThan(
      10 * 60_000,
    );
    expect(daemonRequestTimeout("daemon.status")).toBeLessThan(
      daemonRequestTimeout("session.send"),
    );
    expect(daemonRequestTimeout("worktree.create", 123)).toBe(123);
    expect(() => daemonRequestTimeout("daemon.status", 0)).toThrow();
  });
});

describe("daemon subscription transport", () => {
  it("rejects a connection closed before acknowledgement", async () => {
    const { metadata } = await serve((socket) => socket.end());
    await expect(
      subscribeDaemonEvents(vi.fn(), { metadata }),
    ).rejects.toMatchObject({ code: "DISCONNECTED" });
  });
  it("bounds an unanswered handshake", async () => {
    const { metadata } = await serve(() => {});
    await expect(
      subscribeDaemonEvents(vi.fn(), { metadata, timeoutMs: 30 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("notifies disconnect once and clears the handshake deadline after acknowledgement", async () => {
    let peer: net.Socket | undefined;
    const { metadata } = await serve((socket, request) => {
      peer = socket;
      socket.write(`${JSON.stringify({ id: request.id, result: null })}\n`);
    });
    const onDisconnect = vi.fn();
    const subscription = await subscribeDaemonEvents(vi.fn(), {
      metadata,
      onDisconnect,
      timeoutMs: 100,
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(onDisconnect).not.toHaveBeenCalled();
      peer?.destroy();
      await vi.waitFor(() => expect(onDisconnect).toHaveBeenCalledOnce());
    } finally {
      subscription.close();
    }
  });
  it("does not report explicit close as a reconnectable failure", async () => {
    const { metadata, sockets } = await serve((socket, request) =>
      socket.write(`${JSON.stringify({ id: request.id, result: null })}\n`),
    );
    const onDisconnect = vi.fn();
    const subscription = await subscribeDaemonEvents(vi.fn(), {
      metadata,
      onDisconnect,
    });
    subscription.close();
    await vi.waitFor(() => expect(sockets.size).toBe(0));
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
