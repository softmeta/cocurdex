import {
  createSavedHostStore,
  createSecureHostTransport,
  pairHost,
  type SavedHost,
  savedHostEndpoint,
} from "@cocurdex/client-runtime";
import { requestDaemon } from "@cocurdex/daemon/client";
import { createDaemonRpcClient } from "@cocurdex/rpc/client";
import {
  decodeBase64Url,
  keyPairFromSecretKey,
  openMessage,
} from "@cocurdex/secure-channel";
import {
  PUSH_SEAL_PROLOGUE,
  type PushNotificationContent,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { startChatSession } from "@cocurdex/test-harness/helpers/chat-session";
import {
  type DaemonProcess,
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import {
  type StubLlmServer,
  startStubLlmServer,
} from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveDevice } from "./helpers/approve-device";
import { freePort, type ServiceProcess } from "./helpers/go-service";
import {
  buildPushGateway,
  type FakeApns,
  startFakeApns,
  startPushGateway,
} from "./helpers/push-gateway";

const APNS_TOKEN = "ab".repeat(32);
const tempDirs = createTempDirs();
let apns: FakeApns;
let gateway: ServiceProcess;
let daemon: DaemonProcess;
let stub: StubLlmServer;

beforeAll(async () => {
  const binary = await buildPushGateway(tempDirs.createSync("push-bin-"));
  apns = await startFakeApns();
  gateway = await startPushGateway(
    binary,
    tempDirs.createSync("push-data-"),
    apns.url,
  );
  stub = await startStubLlmServer();
  daemon = await spawnDaemon();
}, 180_000);

afterAll(async () => {
  await daemon?.dispose();
  await gateway?.stop();
  await apns?.close();
  await stub?.close();
  tempDirs.cleanup();
});

async function pairPhone() {
  const port = await freePort();
  await requestDaemon(
    "host.remoteAccess.set",
    { enabled: true, port },
    daemon.options,
  );
  const { code, hostKey } = await requestDaemon(
    "host.pairing.create",
    { label: "iPhone", scopes: ["read", "interact", "approvals"] },
    daemon.options,
  );
  const paired = await pairHost({
    baseUrl: `http://127.0.0.1:${port}`,
    code,
    hostKey,
    store: createSavedHostStore(null),
  });
  return approveDevice(daemon, paired);
}

function deviceClient(host: SavedHost) {
  return createDaemonRpcClient(
    createSecureHostTransport(savedHostEndpoint(host)),
    "",
  );
}

function openNotification(host: SavedHost, ciphertext: string) {
  const plaintext = openMessage({
    recipientKeyPair: keyPairFromSecretKey(
      decodeBase64Url(host.deviceSecretKey),
    ),
    prologue: new TextEncoder().encode(PUSH_SEAL_PROLOGUE),
    message: decodeBase64Url(ciphertext),
  });
  return JSON.parse(
    new TextDecoder().decode(plaintext),
  ) as PushNotificationContent;
}

async function finishTurn(sessionId: string, reply: string) {
  stub.plan = { kind: "script", turns: [{ text: [reply] }] };
  await requestDaemon(
    "session.send",
    { sessionId, messageId: crypto.randomUUID(), content: "Status?" },
    daemon.options,
  );
}

async function pushPlatformOf(deviceId: string) {
  const devices = await requestDaemon("host.devices.list", daemon.options);
  return devices.find((device) => device.id === deviceId)?.pushPlatform;
}

describe("push notifications through the gateway", () => {
  it("delivers an end-to-end encrypted notification and forgets dead tokens", async () => {
    const phone = await pairPhone();
    const client = deviceClient(phone);
    await expect(
      client.request("host.push.register", {
        platform: "apns",
        token: APNS_TOKEN,
        environment: "sandbox",
      }),
    ).resolves.toEqual({ registered: false });

    await requestDaemon("host.push.set", { url: gateway.url }, daemon.options);
    await expect(
      client.request("host.push.register", {
        platform: "apns",
        token: APNS_TOKEN,
        environment: "sandbox",
      }),
    ).resolves.toEqual({ registered: true });
    expect(await pushPlatformOf(phone.deviceId)).toBe("apns");

    const session = await startChatSession(daemon, stub);
    await finishTurn(session.id, "All tests pass.");
    await waitFor(() => apns.deliveries.length > 0, 20_000);

    const [delivery] = apns.deliveries;
    expect(delivery?.token).toBe(APNS_TOKEN);
    expect(delivery?.headers["apns-topic"]).toBe("dev.cocurdex.mobile");
    expect(delivery?.headers["apns-collapse-id"]).toBe(`${session.id}:turn`);
    expect(delivery?.payload.aps).toMatchObject({
      alert: { "loc-key": "PUSH_FALLBACK" },
      "mutable-content": 1,
    });
    expect(JSON.stringify(delivery?.payload)).not.toContain(session.title);
    const host = await requestDaemon("host.identity", daemon.options);
    expect(openNotification(phone, delivery?.payload.c ?? "")).toMatchObject({
      v: 1,
      kind: "turnCompleted",
      hostId: host.hostId,
      sessionId: session.id,
      sessionTitle: session.title,
      requestId: null,
    });

    apns.unregisteredTokens.add(APNS_TOKEN);
    await finishTurn(session.id, "Still green.");
    const deadline = Date.now() + 20_000;
    while ((await pushPlatformOf(phone.deviceId)) !== null) {
      if (Date.now() > deadline) throw new Error("The dead token was kept");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(apns.deliveries).toHaveLength(1);
  });
});
