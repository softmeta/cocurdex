import nodeCrypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { loadOrCreateHostKeys } from "@cocurdex/daemon/internal/host-access/host-key-store";
import {
  createRelayConnector,
  type RelayConnectorState,
  relayRouteId,
} from "@cocurdex/daemon/internal/host-access/relay-connector";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { type WebSocket, WebSocketServer } from "ws";

const SECURE_CHANNEL_WEBSOCKET_PROTOCOL = "cocurdex.secure.v1";
const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

interface Registration {
  routeId: string;
  hostKey: string;
  signingKey: string;
  signature: string;
  credential?: unknown;
}

interface FakeRelay {
  url: string;
  registrations: Registration[];
  controls: WebSocket[];
  accepted: WebSocket[];
  onRegister(reply: (socket: WebSocket, message: Registration) => void): void;
  close(): Promise<void>;
}

const nonce = nodeCrypto.randomBytes(32);

async function startFakeRelay(): Promise<FakeRelay> {
  const server = new WebSocketServer({
    port: 0,
    host: "127.0.0.1",
    handleProtocols: (protocols) =>
      protocols.has(SECURE_CHANNEL_WEBSOCKET_PROTOCOL)
        ? SECURE_CHANNEL_WEBSOCKET_PROTOCOL
        : false,
  });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const relay: FakeRelay = {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    registrations: [],
    controls: [],
    accepted: [],
    onRegister: () => undefined,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of server.clients) client.terminate();
        server.close(() => resolve());
      }),
  };
  let reply = (socket: WebSocket, message: Registration) =>
    socket.send(
      JSON.stringify({ type: "registered", routeId: message.routeId }),
    );
  relay.onRegister = (next) => {
    reply = next;
  };
  server.on("connection", (socket, request) => {
    if (request.url?.startsWith("/v1/host/accept/")) {
      relay.accepted.push(socket);
      return;
    }
    relay.controls.push(socket);
    socket.send(
      JSON.stringify({ type: "challenge", nonce: nonce.toString("base64url") }),
    );
    socket.on("message", (data) => {
      const message = JSON.parse(String(data)) as Registration;
      relay.registrations.push(message);
      reply(socket, message);
    });
  });
  return relay;
}

const relays: FakeRelay[] = [];
const connectors: ReturnType<typeof createRelayConnector>[] = [];

afterEach(async () => {
  for (const connector of connectors.splice(0)) connector.close();
  for (const relay of relays.splice(0)) await relay.close();
});

async function setup() {
  const relay = await startFakeRelay();
  relays.push(relay);
  const keys = loadOrCreateHostKeys(await tempDirs.create("relay-host-"));
  const states: RelayConnectorState[] = [];
  const dataSockets: { socket: WebSocket; remoteAddress: string }[] = [];
  const retries: { attempt: number; refused: boolean }[] = [];
  const connector = createRelayConnector({
    hostKeys: () => keys,
    onDataSocket: (socket, remoteAddress) =>
      dataSockets.push({ socket, remoteAddress }),
    onStateChanged: () => states.push(connector.state()),
    retryDelayMs: (attempt, refused) => {
      retries.push({ attempt, refused });
      return 60_000;
    },
  });
  connectors.push(connector);
  return { relay, keys, connector, states, dataSockets, retries };
}

async function waitFor<T>(read: () => T | undefined | false) {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("Timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("createRelayConnector", () => {
  it("proves the host key to the relay and reports online", async () => {
    const { relay, keys, connector } = await setup();
    const credential = { accountId: "acct", expiresAt: 1, signature: "s" };

    connector.apply({ url: relay.url, credential });
    await waitFor(() => connector.state().state === "online");

    const [registration] = relay.registrations;
    expect(registration?.routeId).toBe(relayRouteId(keys.noisePublicKey));
    expect(registration?.hostKey).toBe(keys.noisePublicKey);
    expect(registration?.credential).toEqual(credential);
    const routeId = Buffer.from(registration?.routeId ?? "", "base64url");
    const payload = Buffer.concat([
      Buffer.from("cocurdex-relay/1"),
      nonce,
      routeId,
    ]);
    const signingKey = nodeCrypto.createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: registration?.signingKey },
      format: "jwk",
    });
    expect(
      nodeCrypto.verify(
        null,
        payload,
        signingKey,
        Buffer.from(registration?.signature ?? "", "base64url"),
      ),
    ).toBe(true);
  });

  it("hands each incoming session to the secure channel acceptor", async () => {
    const { relay, connector, dataSockets } = await setup();
    connector.apply({ url: relay.url, credential: null });
    await waitFor(() => connector.state().state === "online");

    relay.controls[0]?.send(
      JSON.stringify({ type: "incoming", ticket: "t".repeat(43) }),
    );
    const [handed] = await waitFor(() => dataSockets.length > 0 && dataSockets);
    expect(handed?.socket.protocol).toBe(SECURE_CHANNEL_WEBSOCKET_PROTOCOL);
    expect(handed?.remoteAddress).toBe(`relay:${new URL(relay.url).host}`);

    const received = new Promise<string>((resolve) =>
      relay.accepted[0]?.once("message", (data) => resolve(String(data))),
    );
    handed?.socket.send(Buffer.from("ciphertext"));
    expect(await received).toBe("ciphertext");
  });

  it("reports a refused registration and retries slowly", async () => {
    const { relay, connector, retries } = await setup();
    relay.onRegister((socket) => socket.close(4402, "credential"));

    connector.apply({ url: relay.url, credential: null });
    await waitFor(() => connector.state().state === "offline");

    expect(connector.state()).toEqual({
      state: "offline",
      error: "credentialRequired",
    });
    expect(retries).toEqual([{ attempt: 0, refused: true }]);
  });

  it("reports an unreachable relay", async () => {
    const { relay, connector, retries } = await setup();
    await relay.close();

    connector.apply({ url: relay.url, credential: null });
    await waitFor(() => connector.state().state === "offline");

    expect(connector.state().error).toBe("unreachable");
    expect(retries).toEqual([{ attempt: 0, refused: false }]);
  });

  it("disconnects the relay and its sessions when turned off", async () => {
    const { relay, connector, dataSockets, states } = await setup();
    connector.apply({ url: relay.url, credential: null });
    await waitFor(() => connector.state().state === "online");
    relay.controls[0]?.send(
      JSON.stringify({ type: "incoming", ticket: "t".repeat(43) }),
    );
    await waitFor(() => dataSockets.length > 0);
    const controlClosed = new Promise((resolve) =>
      relay.controls[0]?.once("close", resolve),
    );
    const sessionClosed = new Promise((resolve) =>
      relay.accepted[0]?.once("close", resolve),
    );

    connector.apply(null);

    await Promise.all([controlClosed, sessionClosed]);
    expect(connector.state()).toEqual({ state: "off", error: null });
    expect(states.map((state) => state.state)).toEqual([
      "connecting",
      "online",
      "off",
    ]);
  });
});
