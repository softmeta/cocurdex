import {
  pairHost,
  savedHostSafetyCode,
} from "@cocurdex/client-runtime/internal/host-access";
import {
  connectReachableOrigin,
  findDirectOrigin,
} from "@cocurdex/client-runtime/internal/reachable-origin";
import { createSavedHostStore } from "@cocurdex/client-runtime/internal/saved-hosts";
import {
  acceptChannelHello,
  encodeBase64Url,
  generateKeyPair,
  type KeyPair,
  pairingSafetyCode,
} from "@cocurdex/secure-channel";
import type { RemoteChannelReply } from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeHost {
  keys: KeyPair;
  answer(payload: unknown): RemoteChannelReply | "silent";
  delayMs?: number;
}

const accepted = (hostId: string): RemoteChannelReply => ({
  ok: true,
  host: { hostId, name: "Studio" },
  deviceId: "device-1",
  scopes: ["read", "interact"],
  endpoints: ["http://100.101.1.2:47820"],
});

function installNetwork(hosts: Record<string, FakeHost>) {
  const payloads: unknown[] = [];
  const deviceKeys: Uint8Array[] = [];
  const closed: string[] = [];
  class FakeWebSocket extends EventTarget {
    static readonly OPEN = 1;
    readyState = 0;
    binaryType = "blob";
    private readonly host: FakeHost | undefined;

    constructor(readonly url: string) {
      super();
      this.host = hosts[new URL(url).origin.replace(/^ws/, "http")];
      queueMicrotask(() => {
        if (!this.host) {
          this.dispatchEvent(new Event("error"));
          this.close();
          return;
        }
        this.readyState = FakeWebSocket.OPEN;
        this.dispatchEvent(new Event("open"));
      });
    }

    send(bytes: Uint8Array) {
      const host = this.host;
      if (!host) return;
      let hello: ReturnType<typeof acceptChannelHello>;
      try {
        hello = acceptChannelHello({ staticKeyPair: host.keys, hello: bytes });
      } catch {
        this.close();
        return;
      }
      payloads.push(hello.payload);
      deviceKeys.push(hello.remoteStaticKey);
      const reply = host.answer(hello.payload);
      if (reply === "silent") return;
      const { message } = hello.reply(reply);
      setTimeout(
        () =>
          this.dispatchEvent(
            new MessageEvent("message", { data: message.slice().buffer }),
          ),
        host.delayMs ?? 0,
      );
    }

    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      closed.push(new URL(this.url).origin.replace(/^ws/, "http"));
      queueMicrotask(() => this.dispatchEvent(new Event("close")));
    }
  }
  vi.stubGlobal("WebSocket", FakeWebSocket);
  return { payloads, deviceKeys, closed };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const hostKeys = generateKeyPair();
const hostKey = encodeBase64Url(hostKeys.publicKey);
const lan = "http://192.168.1.20:47820";
const tailnet = "http://100.101.1.2:47820";

describe("pairHost", () => {
  it("sends the code inside the handshake and saves the pinned host key", async () => {
    const { payloads } = installNetwork({
      [lan]: { keys: hostKeys, answer: () => accepted("host-1") },
    });
    const store = createSavedHostStore(null);
    const save = vi.spyOn(store, "save");

    const saved = await pairHost({
      baseUrl: `${lan}/some/page`,
      code: "abc",
      hostKey,
      label: "Laptop",
      store,
      now: () => new Date("2026-10-12T00:00:00.000Z"),
    });

    expect(payloads).toEqual([{ secret: "abc", label: "Laptop" }]);
    expect(saved).toMatchObject({
      hostId: "host-1",
      name: "Studio",
      baseUrl: lan,
      endpoints: [lan, tailnet],
      deviceId: "device-1",
      hostKey,
      scopes: ["read", "interact"],
      pairedAt: "2026-10-12T00:00:00.000Z",
    });
    expect(saved.deviceSecretKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(save).toHaveBeenCalledWith(saved);
  });

  it("shows the same safety code the host derives from the device key it saw", async () => {
    const network = installNetwork({
      [lan]: { keys: hostKeys, answer: () => accepted("host-1") },
    });
    const saved = await pairHost({
      baseUrl: lan,
      code: "abc",
      hostKey,
      store: createSavedHostStore(null),
    });
    const [deviceKey] = network.deviceKeys;
    if (!deviceKey) throw new Error("The host saw no device key");

    expect(savedHostSafetyCode(saved)).toBe(
      pairingSafetyCode(hostKeys.publicKey, deviceKey),
    );
  });

  it.each([
    ["rejected", "invalid"],
    ["rateLimited", "rateLimited"],
  ] as const)(
    "maps a %s reply to %s and saves nothing",
    async (reason, failure) => {
      installNetwork({
        [lan]: { keys: hostKeys, answer: () => ({ ok: false, reason }) },
      });
      const store = createSavedHostStore(null);
      const save = vi.spyOn(store, "save");

      await expect(
        pairHost({ baseUrl: lan, code: "abc", hostKey, store }),
      ).rejects.toMatchObject({ reason: failure });
      expect(save).not.toHaveBeenCalled();
    },
  );

  it("refuses a host that does not hold the pinned key", async () => {
    installNetwork({
      [lan]: { keys: generateKeyPair(), answer: () => accepted("host-1") },
    });
    const store = createSavedHostStore(null);
    const save = vi.spyOn(store, "save");

    await expect(
      pairHost({ baseUrl: lan, code: "abc", hostKey, store }),
    ).rejects.toMatchObject({ reason: "unreachable" });
    expect(save).not.toHaveBeenCalled();
  });

  it("gives up on a host that never answers and reports it unreachable", async () => {
    vi.useFakeTimers();
    installNetwork({ [lan]: { keys: hostKeys, answer: () => "silent" } });
    const pairing = pairHost({
      baseUrl: lan,
      code: "abc",
      hostKey,
      store: createSavedHostStore(null),
    }).catch((caught: unknown) => caught);

    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pairing).resolves.toMatchObject({ reason: "unreachable" });
  });
});

describe("connectReachableOrigin", () => {
  const host = {
    hostId: "host-1",
    baseUrl: lan,
    endpoints: [lan, tailnet, "http://10.0.0.5:47820"],
    hostKey,
    deviceId: "device-1",
    deviceSecretKey: encodeBase64Url(generateKeyPair().secretKey),
  };
  const answering = (hostId: string, delayMs = 0): FakeHost => ({
    keys: hostKeys,
    answer: () => accepted(hostId),
    delayMs,
  });
  const connectedOrigin = async (
    options: Parameters<typeof connectReachableOrigin>[0],
  ) => (await connectReachableOrigin(options))?.origin ?? null;

  it("switches to the address that answers when the paired LAN address is gone", async () => {
    installNetwork({ [tailnet]: answering("host-1") });

    expect(await connectedOrigin({ host })).toBe(tailnet);
  });

  it("stays on the current address when it answers, even if another answers first", async () => {
    const network = installNetwork({
      [lan]: answering("host-1", 50),
      [tailnet]: answering("host-1"),
    });

    expect(await connectedOrigin({ host })).toBe(lan);
    await vi.waitFor(() => expect(network.closed).toContain(tailnet));
    expect(network.closed).not.toContain(lan);
  });

  it("keeps the winning connection open and closes the others", async () => {
    const network = installNetwork({
      [lan]: answering("host-1"),
      [tailnet]: answering("host-1", 20),
    });

    const connected = await connectReachableOrigin({ host });

    await vi.waitFor(() => expect(network.closed).toContain(tailnet));
    expect(connected?.origin).toBe(lan);
    expect(network.closed).not.toContain(lan);
    connected?.opened.close();
    await vi.waitFor(() => expect(network.closed).toContain(lan));
  });

  describe("with a relay", () => {
    const relay = "https://relay.example.invalid";
    const relayEndpoint = `${relay}/v1/connect/${"r".repeat(22)}`;
    const relayed = {
      ...host,
      baseUrl: relayEndpoint,
      endpoints: [relayEndpoint, lan, tailnet],
    };

    it("takes the relay at once and reports a direct address that answers later", async () => {
      installNetwork({
        [relay]: answering("host-1"),
        [lan]: answering("host-1", 50),
      });
      const found: string[] = [];

      const origin = await connectedOrigin({
        host: relayed,
        onDirectFound: (direct) => found.push(direct),
      });

      expect(origin).toBe(relayEndpoint);
      await vi.waitFor(() => expect(found).toEqual([lan]));
    });

    it("uses the relay when no direct address answers", async () => {
      installNetwork({ [relay]: answering("host-1") });

      expect(await connectedOrigin({ host: relayed })).toBe(relayEndpoint);
    });

    it("finds a direct address without probing the relay", async () => {
      installNetwork({
        [relay]: answering("host-1"),
        [tailnet]: answering("host-1"),
      });

      expect(await findDirectOrigin({ host: relayed })).toBe(tailnet);
      installNetwork({ [relay]: answering("host-1") });
      expect(await findDirectOrigin({ host: relayed })).toBeNull();
    });
  });

  it("reports that the computer is waiting to approve this device", async () => {
    installNetwork({
      [tailnet]: {
        keys: hostKeys,
        answer: () => ({ ok: false, reason: "pending" }),
      },
    });

    await expect(connectReachableOrigin({ host })).rejects.toMatchObject({
      reason: "pending",
    });
  });

  it("reports a revoked device instead of an unreachable computer", async () => {
    installNetwork({
      [tailnet]: {
        keys: hostKeys,
        answer: () => ({ ok: false, reason: "rejected" }),
      },
    });

    await expect(connectReachableOrigin({ host })).rejects.toMatchObject({
      reason: "invalid",
    });
  });

  it("ignores a different computer that now answers on a known address", async () => {
    installNetwork({ "http://10.0.0.5:47820": answering("host-2") });

    expect(await connectReachableOrigin({ host })).toBeNull();
  });

  it("ignores an address whose host does not hold the pinned key", async () => {
    installNetwork({
      "http://10.0.0.5:47820": {
        keys: generateKeyPair(),
        answer: () => accepted("host-1"),
      },
    });

    expect(await connectReachableOrigin({ host })).toBeNull();
  });
});
