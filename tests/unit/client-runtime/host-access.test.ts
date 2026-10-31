import {
  findReachableOrigin,
  pairHost,
  savedHostSafetyCode,
} from "@cocurdex/client-runtime/internal/host-access";
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
      queueMicrotask(() => this.dispatchEvent(new Event("close")));
    }
  }
  vi.stubGlobal("WebSocket", FakeWebSocket);
  return { payloads, deviceKeys };
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

describe("findReachableOrigin", () => {
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

  it("switches to the address that answers when the paired LAN address is gone", async () => {
    installNetwork({ [tailnet]: answering("host-1") });

    expect((await findReachableOrigin({ host }))?.origin).toBe(tailnet);
  });

  it("stays on the current address when it answers, even if another answers first", async () => {
    installNetwork({
      [lan]: answering("host-1", 50),
      [tailnet]: answering("host-1"),
    });

    expect((await findReachableOrigin({ host }))?.origin).toBe(lan);
  });

  it("ignores a different computer that now answers on a known address", async () => {
    installNetwork({ "http://10.0.0.5:47820": answering("host-2") });

    expect(await findReachableOrigin({ host })).toBeNull();
  });

  it("ignores an address whose host does not hold the pinned key", async () => {
    installNetwork({
      "http://10.0.0.5:47820": {
        keys: generateKeyPair(),
        answer: () => accepted("host-1"),
      },
    });

    expect(await findReachableOrigin({ host })).toBeNull();
  });
});
