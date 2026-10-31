import {
  type FetchLike,
  HostAccessError,
  pairHost,
  savedHostEndpoint,
  verifyHostCredential,
} from "@cocurdex/client-runtime/internal/host-access";
import { createSavedHostStore } from "@cocurdex/client-runtime/internal/saved-hosts";
import { describe, expect, it, vi } from "vitest";

function respond(status: number, body: unknown = {}): FetchLike {
  return vi.fn(async () => Response.json(body, { status }));
}

const exchanged = {
  host: { hostId: "host-1", name: "Studio" },
  deviceId: "device-1",
  token: "cocu_dev_a",
  scopes: ["read", "interact"],
};

describe("pairHost", () => {
  it("exchanges the code at the host origin and saves the credential", async () => {
    const fetch = respond(200, exchanged);
    const store = createSavedHostStore(null);
    const save = vi.spyOn(store, "save");

    const saved = await pairHost({
      baseUrl: "http://192.168.1.20:47820/some/page",
      code: "abc",
      label: "Laptop",
      store,
      fetch,
      now: () => new Date("2026-10-12T00:00:00.000Z"),
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://192.168.1.20:47820/api/pair",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "abc", label: "Laptop" }),
      }),
    );
    expect(saved).toEqual({
      hostId: "host-1",
      name: "Studio",
      baseUrl: "http://192.168.1.20:47820",
      deviceId: "device-1",
      token: "cocu_dev_a",
      scopes: ["read", "interact"],
      pairedAt: "2026-10-12T00:00:00.000Z",
    });
    expect(save).toHaveBeenCalledWith(saved);
  });

  it.each([
    [401, "invalid"],
    [429, "rateLimited"],
    [500, "unreachable"],
  ] as const)(
    "maps HTTP %i to %s and saves nothing",
    async (status, reason) => {
      const store = createSavedHostStore(null);
      const save = vi.spyOn(store, "save");

      await expect(
        pairHost({
          baseUrl: "http://host:47820",
          code: "abc",
          store,
          fetch: respond(status),
        }),
      ).rejects.toMatchObject({ reason });
      expect(save).not.toHaveBeenCalled();
    },
  );

  it("gives up on a host that never answers and reports it unreachable", async () => {
    vi.useFakeTimers();
    try {
      const hanging: FetchLike = (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      const pairing = pairHost({
        baseUrl: "http://192.168.1.20:47820",
        code: "abc",
        store: createSavedHostStore(null),
        fetch: hanging,
      }).catch((caught: unknown) => caught);

      await vi.advanceTimersByTimeAsync(15_000);

      await expect(pairing).resolves.toMatchObject({ reason: "unreachable" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("verifyHostCredential", () => {
  it("sends the device token as a bearer credential", async () => {
    const fetch = respond(200, {
      host: exchanged.host,
      principal: { kind: "device", deviceId: "device-1", scopes: ["read"] },
    });

    await expect(
      verifyHostCredential({
        baseUrl: "http://host:47820",
        token: "cocu_dev_a",
        fetch,
      }),
    ).resolves.toMatchObject({ host: { hostId: "host-1" } });
    expect(fetch).toHaveBeenCalledWith(
      "http://host:47820/api/session",
      expect.objectContaining({
        headers: { authorization: "Bearer cocu_dev_a" },
      }),
    );
  });

  it("reports a network failure as unreachable", async () => {
    const error = await verifyHostCredential({
      baseUrl: "http://host:47820",
      token: "t",
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HostAccessError);
    expect(error).toMatchObject({ reason: "unreachable" });
  });
});

describe("savedHostEndpoint", () => {
  it("opens the WebSocket on the paired origin with the device token", () => {
    expect(
      savedHostEndpoint({ baseUrl: "http://192.168.1.20:47820", token: "t" }),
    ).toEqual({ webSocketUrl: "ws://192.168.1.20:47820", token: "t" });
    expect(
      savedHostEndpoint({
        baseUrl: "https://studio.example.invalid",
        token: "t",
      }),
    ).toEqual({ webSocketUrl: "wss://studio.example.invalid", token: "t" });
  });
});
