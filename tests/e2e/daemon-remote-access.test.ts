import { readdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  createDaemonRpcClient,
  createWebSocketTransport,
  daemonWebSocketProtocols,
} from "@cocurdex/rpc/client";
import {
  buildDaemonAttachmentUploadUrl,
  buildDaemonImageAttachmentUrl,
  HOST_PAIRING_HTTP_PATH,
  HOST_SESSION_HTTP_PATH,
  type HostAccessScope,
  type ImageAttachment,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { saveStubProvider, startChatSession } from "./helpers/chat-session";
import { type DaemonProcess, spawnDaemon } from "./helpers/daemon-process";
import { startStubLlmServer } from "./helpers/llm-stub";

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("No free port")),
      );
    });
  });
}

function remoteClient(port: number, token: string) {
  return createDaemonRpcClient(
    createWebSocketTransport(
      `ws://127.0.0.1:${port}`,
      daemonWebSocketProtocols(token),
    ),
    token,
  );
}

function exchange(port: number, body: unknown) {
  return fetch(`http://127.0.0.1:${port}${HOST_PAIRING_HTTP_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function checkSession(port: number, token: string) {
  return fetch(`http://127.0.0.1:${port}${HOST_SESSION_HTTP_PATH}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function enableRemoteAccess(daemon: DaemonProcess) {
  const port = await freePort();
  const status = await requestDaemon(
    "host.remoteAccess.set",
    { enabled: true, port },
    daemon.options,
  );
  expect(status).toMatchObject({ listening: true, error: null });
  return port;
}

async function pairDevice(
  daemon: DaemonProcess,
  port: number,
  scopes: HostAccessScope[] = ["read"],
) {
  const { code } = await requestDaemon(
    "host.pairing.create",
    { label: "Phone", scopes },
    daemon.options,
  );
  const response = await exchange(port, { code, label: "Pixel" });
  expect(response.status).toBe(200);
  return {
    code,
    paired: (await response.json()) as { token: string; deviceId: string },
  };
}

function collectFrames(socket: WebSocket) {
  const frames: string[] = [];
  socket.addEventListener("message", (message) => {
    frames.push(String(message.data));
  });
  return frames;
}

async function waitUntil(condition: () => boolean, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

const daemons: DaemonProcess[] = [];

afterEach(async () => {
  for (const daemon of daemons.splice(0)) await daemon.dispose();
});

describe("remote host access", () => {
  it("keeps remote access off until enabled", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);

    const status = await requestDaemon("host.remoteAccess.get", daemon.options);

    expect(status).toMatchObject({
      settings: { enabled: false },
      listening: false,
      addresses: [],
    });
  });

  it("pairs a device once and limits it to the scopes it was granted", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const port = await enableRemoteAccess(daemon);
    const { code, paired } = await pairDevice(daemon, port);

    const replay = await exchange(port, { code });
    expect(replay.status).toBe(401);

    const session = await checkSession(port, paired.token);
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      principal: { kind: "device", deviceId: paired.deviceId },
    });
    const client = remoteClient(port, paired.token);
    await expect(client.request("session.list", undefined)).resolves.toEqual(
      [],
    );
    await expect(
      client.request("host.session", undefined),
    ).resolves.toMatchObject({
      principal: {
        kind: "device",
        deviceId: paired.deviceId,
        scopes: ["read"],
      },
    });
    await expect(
      client.request("host.devices.list", undefined),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      client.request("session.stop", { sessionId: "missing" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const audit = await requestDaemon("host.audit.list", {}, daemon.options);
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "remote.enabled",
        "pairing.created",
        "pairing.exchanged",
        "pairing.rejected",
      ]),
    );
  });

  it("streams image attachments to and from a device that may interact", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const port = await enableRemoteAccess(daemon);
    const writer = await pairDevice(daemon, port, [
      "read",
      "files.read",
      "interact",
    ]);
    const reader = await pairDevice(daemon, port, ["read"]);
    const approver = await pairDevice(daemon, port, ["approvals"]);
    const webSocketUrl = `ws://127.0.0.1:${port}`;
    const gif = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x04, 0x00, 0x05, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const upload = (token: string) =>
      fetch(buildDaemonAttachmentUploadUrl(webSocketUrl, "image", "a.gif"), {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: gif,
      });

    expect((await upload(reader.paired.token)).status).toBe(403);
    await expect(
      readdir(path.join(daemon.userDataPath, "image-attachments")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const uploaded = await upload(writer.paired.token);
    expect(uploaded.status).toBe(201);
    const attachment = (await uploaded.json()) as ImageAttachment;
    expect(attachment).toMatchObject({ width: 4, height: 5, name: "a.gif" });

    const imageUrl = buildDaemonImageAttachmentUrl(
      webSocketUrl,
      attachment.filePath,
    );
    const denied = await fetch(imageUrl, {
      headers: { authorization: `Bearer ${approver.paired.token}` },
    });
    expect(denied.status).toBe(403);
    for (const device of [writer, reader]) {
      const read = await fetch(imageUrl, {
        headers: { authorization: `Bearer ${device.paired.token}` },
      });
      expect(read.status).toBe(200);
      expect(Buffer.from(await read.arrayBuffer())).toEqual(gif);
    }
  });

  it("withholds provider headers from devices without credentials access", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    try {
      const port = await enableRemoteAccess(daemon);
      const session = await startChatSession(daemon, stub);
      const { paired } = await pairDevice(daemon, port, ["read", "interact"]);
      const client = remoteClient(port, paired.token);

      const responses = await Promise.all([
        client.request("provider.listConfigs", undefined),
        client.request("provider.listCompatibleForAgent", { agentId: "pi" }),
        client.request("session.get", { sessionId: session.id }),
        client.request("session.list", undefined),
      ]);
      expect(responses[2]?.providerSnapshot).toMatchObject({
        providerId: "e2e-stub",
        headersJson: null,
      });
      expect(JSON.stringify(responses)).not.toContain("e2e-key");

      const socket = new WebSocket(
        `ws://127.0.0.1:${port}`,
        daemonWebSocketProtocols(paired.token),
      );
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve());
        socket.addEventListener("error", () =>
          reject(new Error("open failed")),
        );
      });
      const frames = collectFrames(socket);
      socket.send(
        JSON.stringify({
          id: "1",
          method: "daemon.subscribe",
          params: {},
          token: paired.token,
        }),
      );
      stub.plan = { kind: "stream", chunks: ["Hello"] };
      await requestDaemon(
        "session.send",
        {
          sessionId: session.id,
          messageId: crypto.randomUUID(),
          content: "hi there",
        },
        daemon.options,
      );
      await waitUntil(() =>
        frames.some((frame) => frame.includes('"turn.completed"')),
      );
      socket.close();
      expect(frames.join("\n")).not.toContain("e2e-key");

      const local = await requestDaemon(
        "session.get",
        { sessionId: session.id },
        daemon.options,
      );
      expect(local?.providerSnapshot?.headersJson).toContain("e2e-key");
    } finally {
      await stub.close();
    }
  });

  it("lets a device that may execute start a session the daemon configures", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    try {
      const port = await enableRemoteAccess(daemon);
      await saveStubProvider(daemon, stub);
      const now = new Date().toISOString();
      await requestDaemon(
        "provider.model.save",
        {
          model: {
            providerId: "e2e-stub",
            modelId: "e2e-agent-model",
            name: "E2E Agent Model",
            api: "openai-completions",
            enabled: true,
            source: "manual",
            capabilities: ["chat", "agent"],
            createdAt: now,
            updatedAt: now,
          },
        },
        daemon.options,
      );
      await requestDaemon(
        "workspace.save",
        {
          workspace: {
            id: "phone-workspace",
            name: "acme-shop",
            rootPaths: [tempDirs.createSync("phone-ws-")],
            createdAt: now,
            updatedAt: now,
            lastOpenedAt: now,
            sortOrder: 0,
          },
        },
        daemon.options,
      );
      const executor = await pairDevice(daemon, port, [
        "read",
        "interact",
        "execute",
      ]);
      const viewer = await pairDevice(daemon, port, ["read", "interact"]);
      const request = {
        workspaceId: "phone-workspace",
        agentType: "pi" as const,
        model: { providerId: "e2e-stub", modelId: "e2e-agent-model" },
        title: "Phone task",
      };

      await expect(
        remoteClient(port, viewer.paired.token).request(
          "session.create",
          request,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const client = remoteClient(port, executor.paired.token);
      const session = await client.request("session.create", request);
      expect(session).toMatchObject({
        workspaceId: "phone-workspace",
        agentType: "pi",
        sessionKind: "main",
        title: "Phone task",
        providerSnapshot: { providerId: "e2e-stub", headersJson: null },
      });
      expect(JSON.stringify(session)).not.toContain("e2e-key");

      stub.plan = { kind: "stream", chunks: ["On it"] };
      const sent = stub.nextRequest();
      await client.request("session.send", {
        sessionId: session.id,
        messageId: crypto.randomUUID(),
        content: "Summarize the cart module",
      });
      expect((await sent).authorization).toBe("Bearer e2e-key");
    } finally {
      await stub.close();
    }
  });

  it("refuses the local full-access token on the remote listener", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const port = await enableRemoteAccess(daemon);

    expect((await checkSession(port, daemon.metadata.token)).status).toBe(401);
    await expect(
      remoteClient(port, daemon.metadata.token).request(
        "session.list",
        undefined,
      ),
    ).rejects.toMatchObject({ code: "TRANSPORT_ERROR" });
  });

  it("reconnects a device with its changed scopes", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const port = await enableRemoteAccess(daemon);
    const { paired } = await pairDevice(daemon, port);
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}`,
      daemonWebSocketProtocols(paired.token),
    );
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("open failed")));
    });
    const closed = new Promise<void>((resolve) =>
      socket.addEventListener("close", () => resolve()),
    );
    socket.send(
      JSON.stringify({
        id: "1",
        method: "daemon.subscribe",
        params: {},
        token: paired.token,
      }),
    );

    const updated = await requestDaemon(
      "host.devices.updateScopes",
      { deviceId: paired.deviceId, scopes: ["read", "files.read"] },
      daemon.options,
    );

    await closed;
    expect(updated?.scopes).toEqual(["read", "files.read"]);
    const session = await remoteClient(port, paired.token).request(
      "host.session",
      undefined,
    );
    expect(session.principal).toEqual({
      kind: "device",
      deviceId: paired.deviceId,
      scopes: ["read", "files.read"],
    });
  });

  it("lets a paired device unpair itself and refuses the local principal", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const port = await enableRemoteAccess(daemon);
    const { paired } = await pairDevice(daemon, port);
    const { paired: other } = await pairDevice(daemon, port);

    const revoked = await remoteClient(port, paired.token).request(
      "host.devices.revokeSelf",
      undefined,
    );

    expect(revoked).toMatchObject({ id: paired.deviceId });
    expect(revoked?.revokedAt).not.toBeNull();
    expect((await checkSession(port, paired.token)).status).toBe(401);
    expect((await checkSession(port, other.token)).status).toBe(200);
    await expect(
      requestDaemon("host.devices.revokeSelf", daemon.options),
    ).rejects.toThrow();
  });

  it("disconnects a device as soon as it is revoked", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const port = await enableRemoteAccess(daemon);
    const { paired } = await pairDevice(daemon, port);
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}`,
      daemonWebSocketProtocols(paired.token),
    );
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("open failed")));
    });
    const closed = new Promise<void>((resolve) =>
      socket.addEventListener("close", () => resolve()),
    );
    socket.send(
      JSON.stringify({
        id: "1",
        method: "daemon.subscribe",
        params: {},
        token: paired.token,
      }),
    );

    await requestDaemon(
      "host.devices.revoke",
      { deviceId: paired.deviceId },
      daemon.options,
    );

    await closed;
    expect((await checkSession(port, paired.token)).status).toBe(401);
    await expect(
      remoteClient(port, paired.token).request("session.list", undefined),
    ).rejects.toMatchObject({ code: "TRANSPORT_ERROR" });
  });
});
