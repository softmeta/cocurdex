import { readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import {
  createRemoteFileClient,
  createSavedHostStore,
  createSecureHostTransport,
  HostAccessError,
  pairHost,
  RemoteFileError,
  type SavedHost,
  savedHostEndpoint,
  savedHostSafetyCode,
} from "@cocurdex/client-runtime";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  createDaemonRpcClient,
  createWebSocketTransport,
  daemonWebSocketProtocols,
} from "@cocurdex/rpc/client";
import { encodeBase64Url, generateKeyPair } from "@cocurdex/secure-channel";
import type { HostAccessScope } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  saveStubProvider,
  startChatSession,
} from "@cocurdex/test-harness/helpers/chat-session";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, afterEach, describe, expect, it } from "vitest";

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

function remoteClient(host: SavedHost) {
  return createDaemonRpcClient(
    createSecureHostTransport(savedHostEndpoint(host)),
    "",
  );
}

function fileClient(host: SavedHost) {
  return createRemoteFileClient({
    endpoint: async () => savedHostEndpoint(host),
  });
}

async function readAll(body: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
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

async function createPairing(
  daemon: DaemonProcess,
  scopes: HostAccessScope[] = ["read"],
) {
  return requestDaemon(
    "host.pairing.create",
    { label: "Phone", scopes },
    daemon.options,
  );
}

async function pairDevice(
  daemon: DaemonProcess,
  port: number,
  scopes: HostAccessScope[] = ["read"],
) {
  const { code, hostKey } = await createPairing(daemon, scopes);
  return pairHost({
    baseUrl: `http://127.0.0.1:${port}`,
    code,
    hostKey,
    label: "Pixel",
    store: createSavedHostStore(null),
  });
}

function openSubscription(host: SavedHost) {
  let closed = false;
  const frames: string[] = [];
  const connection = createSecureHostTransport(savedHostEndpoint(host))({
    onMessage: (message) => frames.push(message),
    onError: () => {},
    onClose: () => {
      closed = true;
    },
  });
  connection.send(
    JSON.stringify({ id: "1", method: "daemon.subscribe", params: {} }),
  );
  return { frames, isClosed: () => closed, close: connection.close };
}

function captureWebSocketTraffic() {
  const NativeWebSocket = globalThis.WebSocket;
  const captured: Buffer[] = [];
  const record = (data: unknown) => {
    if (data instanceof ArrayBuffer) captured.push(Buffer.from(data));
    else if (ArrayBuffer.isView(data)) {
      captured.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    } else captured.push(Buffer.from(String(data)));
  };
  class RecordingWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener("message", (event) => record(event.data));
    }
    override send(data: Parameters<WebSocket["send"]>[0]) {
      record(data);
      super.send(data);
    }
  }
  globalThis.WebSocket = RecordingWebSocket as typeof WebSocket;
  return {
    bytes: () => Buffer.concat(captured),
    restore: () => {
      globalThis.WebSocket = NativeWebSocket;
    },
  };
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
    const { code, hostKey } = await createPairing(daemon);
    const baseUrl = `http://127.0.0.1:${port}`;
    const store = createSavedHostStore(null);
    const paired = await pairHost({ baseUrl, code, hostKey, store });

    await expect(
      pairHost({ baseUrl, code, hostKey, store }),
    ).rejects.toMatchObject({ reason: "invalid" });

    const status = await requestDaemon("host.remoteAccess.get", daemon.options);
    const endpoints = status.addresses.map((address) => address.url);
    expect(paired.endpoints).toEqual(
      expect.arrayContaining([baseUrl, ...endpoints]),
    );
    const client = remoteClient(paired);
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
      endpoints,
    });
    await expect(
      client.request("host.devices.list", undefined),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      client.request("session.stop", { sessionId: "missing" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const devices = await requestDaemon("host.devices.list", daemon.options);
    expect(devices[0]?.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(devices[0]?.safetyCode).toBe(savedHostSafetyCode(paired));
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

  it("keeps the host key in a private file that survives restarts", async () => {
    const userDataPath = tempDirs.createSync("host-key-");
    const first = await spawnDaemon({ userDataPath });
    daemons.push(first);
    const { hostKey } = await createPairing(first);
    await first.stop();
    const second = await spawnDaemon({ userDataPath });
    daemons.push(second);

    expect((await createPairing(second)).hostKey).toBe(hostKey);
    const keyFile = path.join(userDataPath, "remote-host-key.json");
    expect(readFileSync(keyFile, "utf8")).not.toContain(hostKey);
    if (process.platform !== "win32") {
      expect(statSync(keyFile).mode & 0o777).toBe(0o600);
    }
  });

  it("refuses a device that pinned a different host key and keeps the code", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const port = await enableRemoteAccess(daemon);
    const { code, hostKey } = await createPairing(daemon);
    const baseUrl = `http://127.0.0.1:${port}`;
    const store = createSavedHostStore(null);

    const impostorKey = encodeBase64Url(generateKeyPair().publicKey);
    const refused = await pairHost({
      baseUrl,
      code,
      hostKey: impostorKey,
      store,
    }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(HostAccessError);
    expect(store.list()).toEqual([]);
    await expect(
      pairHost({ baseUrl, code, hostKey, store }),
    ).resolves.toMatchObject({ scopes: ["read"] });
  });

  it("never puts the pairing secret, ids, or payloads on the wire in clear", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const capture = captureWebSocketTraffic();
    try {
      const port = await enableRemoteAccess(daemon);
      const session = await startChatSession(daemon, stub);
      const { code, hostKey } = await createPairing(daemon, ["read"]);
      const paired = await pairHost({
        baseUrl: `http://127.0.0.1:${port}`,
        code,
        hostKey,
        label: "Pixel",
        store: createSavedHostStore(null),
      });
      const fetched = await remoteClient(paired).request("session.get", {
        sessionId: session.id,
      });
      expect(fetched?.id).toBe(session.id);

      const wire = capture.bytes().toString("latin1");
      expect(wire).toContain('"mode":"pair"');
      for (const secret of [code, paired.deviceId, session.id, "Pixel"]) {
        expect(wire).not.toContain(secret);
      }
    } finally {
      capture.restore();
      await stub.close();
    }
  });

  it("withholds provider headers from devices without credentials access", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    try {
      const port = await enableRemoteAccess(daemon);
      const session = await startChatSession(daemon, stub);
      const paired = await pairDevice(daemon, port, ["read", "interact"]);
      const client = remoteClient(paired);

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

      const subscription = openSubscription(paired);
      await waitUntil(() => subscription.frames.length > 0);
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
        subscription.frames.some((frame) => frame.includes('"turn.completed"')),
      );
      subscription.close();
      expect(subscription.frames.join("\n")).not.toContain("e2e-key");

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
        remoteClient(viewer).request("session.create", request),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const client = remoteClient(executor);
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

  it("serves nothing in clear on the remote port", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const port = await enableRemoteAccess(daemon);
    const origin = `http://127.0.0.1:${port}`;

    for (const route of ["/", "/api/pair", "/api/session", "/index.html"]) {
      expect((await fetch(`${origin}${route}`)).status).toBe(404);
    }
    await expect(
      createDaemonRpcClient(
        createWebSocketTransport(
          `ws://127.0.0.1:${port}`,
          daemonWebSocketProtocols(daemon.metadata.token),
        ),
        daemon.metadata.token,
      ).request("session.list", undefined),
    ).rejects.toMatchObject({ code: "TRANSPORT_ERROR" });
  });

  it("streams files only to devices whose scopes allow them", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const port = await enableRemoteAccess(daemon);
    const rootPath = tempDirs.createSync("files-ws-");
    const outsidePath = path.join(tempDirs.createSync("outside-"), "x.txt");
    writeFileSync(
      path.join(rootPath, "notes.txt"),
      "hello remote files",
      "utf8",
    );
    writeFileSync(outsidePath, "outside secret", "utf8");
    const escapes = process.platform !== "win32";
    if (escapes) symlinkSync(outsidePath, path.join(rootPath, "escape.txt"));
    const now = new Date().toISOString();
    await requestDaemon(
      "workspace.save",
      {
        workspace: {
          id: "files-workspace",
          name: "files",
          rootPaths: [rootPath],
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
          sortOrder: 0,
        },
      },
      daemon.options,
    );
    const writer = fileClient(
      await pairDevice(daemon, port, ["read", "files.read", "interact"]),
    );
    const reader = fileClient(await pairDevice(daemon, port, ["read"]));
    const approver = fileClient(await pairDevice(daemon, port, ["approvals"]));
    const gif = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x04, 0x00, 0x05, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const imageUpload = {
      kind: "attachmentUpload",
      upload: "image",
      name: "a.gif",
    } as const;
    try {
      await expect(reader.upload(imageUpload, gif)).rejects.toMatchObject({
        reason: "forbidden",
      });
      await expect(
        readdir(path.join(daemon.userDataPath, "image-attachments")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(
        writer.upload(imageUpload, Buffer.from("not an image")),
      ).rejects.toMatchObject({ reason: "unsupported" });

      const attachment = await writer.upload(imageUpload, gif);
      expect(attachment).toMatchObject({ width: 4, height: 5, name: "a.gif" });
      const image = {
        kind: "imageAttachment",
        file: path.basename(attachment.filePath),
      } as const;
      await expect(approver.read(image)).rejects.toBeInstanceOf(
        RemoteFileError,
      );
      for (const device of [writer, reader]) {
        const read = await device.read(image);
        expect(read.contentType).toBe("image/gif");
        expect(await readAll(read.body)).toEqual(gif);
      }

      const notes = path.join(rootPath, "notes.txt");
      const ranged = await writer.read({
        kind: "workspaceFile",
        path: notes,
        range: { start: 6, end: 11 },
      });
      expect(ranged).toMatchObject({ size: 18, start: 6, end: 11 });
      expect((await readAll(ranged.body)).toString("utf8")).toBe("remote");
      await expect(
        reader.read({ kind: "workspaceFile", path: notes }),
      ).rejects.toMatchObject({ reason: "forbidden" });
      const refused = [outsidePath];
      if (escapes) refused.push(path.join(rootPath, "escape.txt"));
      for (const filePath of refused) {
        await expect(
          writer.read({ kind: "workspaceFile", path: filePath }),
        ).rejects.toMatchObject({ reason: "forbidden" });
      }
    } finally {
      for (const client of [writer, reader, approver]) client.close();
    }
  });

  it("reconnects a device with its changed scopes", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const port = await enableRemoteAccess(daemon);
    const paired = await pairDevice(daemon, port);
    const subscription = openSubscription(paired);
    await waitUntil(() => subscription.frames.length > 0);

    const updated = await requestDaemon(
      "host.devices.updateScopes",
      { deviceId: paired.deviceId, scopes: ["read", "files.read"] },
      daemon.options,
    );

    await waitUntil(subscription.isClosed);
    expect(updated?.scopes).toEqual(["read", "files.read"]);
    const session = await remoteClient(paired).request(
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
    const paired = await pairDevice(daemon, port);
    const other = await pairDevice(daemon, port);

    const revoked = await remoteClient(paired).request(
      "host.devices.revokeSelf",
      undefined,
    );

    expect(revoked).toMatchObject({ id: paired.deviceId });
    expect(revoked?.revokedAt).not.toBeNull();
    await expect(
      remoteClient(paired).request("session.list", undefined),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      remoteClient(other).request("session.list", undefined),
    ).resolves.toEqual([]);
    await expect(
      requestDaemon("host.devices.revokeSelf", daemon.options),
    ).rejects.toThrow();
  });

  it("disconnects a device as soon as it is revoked", async () => {
    const daemon = await spawnDaemon();
    daemons.push(daemon);
    const port = await enableRemoteAccess(daemon);
    const paired = await pairDevice(daemon, port);
    const subscription = openSubscription(paired);
    await waitUntil(() => subscription.frames.length > 0);

    await requestDaemon(
      "host.devices.revoke",
      { deviceId: paired.deviceId },
      daemon.options,
    );

    await waitUntil(subscription.isClosed);
    await expect(
      remoteClient(paired).request("session.list", undefined),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
