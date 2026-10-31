import {
  createSavedHostStore,
  type SavedHost,
} from "@cocurdex/client-runtime/internal/saved-hosts";
import { describe, expect, it } from "vitest";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set("hosts", initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function host(overrides: Partial<SavedHost> = {}): SavedHost {
  return {
    hostId: "host-1",
    name: "Studio",
    baseUrl: "http://192.168.1.20:47820",
    deviceId: "device-1",
    token: "cocu_dev_a",
    scopes: ["read"],
    pairedAt: "2026-10-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("createSavedHostStore", () => {
  it("finds a saved host by origin regardless of path", () => {
    const store = createSavedHostStore(memoryStorage(), "hosts");
    store.save(host());

    expect(
      store.findByBaseUrl("http://192.168.1.20:47820/sessions?x=1")?.token,
    ).toBe("cocu_dev_a");
    expect(store.findByBaseUrl("http://192.168.1.21:47820")).toBeNull();
  });

  it("replaces the credential when the same host or address is paired again", () => {
    const store = createSavedHostStore(memoryStorage(), "hosts");
    store.save(host());
    store.save(host({ deviceId: "device-2", token: "cocu_dev_b" }));
    store.save(
      host({ hostId: "host-2", deviceId: "device-3", token: "cocu_dev_c" }),
    );

    expect(store.list().map((saved) => saved.token)).toEqual(["cocu_dev_c"]);
  });

  it("forgets a revoked host", () => {
    const store = createSavedHostStore(memoryStorage(), "hosts");
    store.save(host());
    store.remove("host-1");

    expect(store.list()).toEqual([]);
  });

  it("ignores corrupt or foreign storage contents", () => {
    expect(
      createSavedHostStore(memoryStorage("{not json"), "hosts").list(),
    ).toEqual([]);
    expect(
      createSavedHostStore(
        memoryStorage(JSON.stringify([host({ scopes: ["root" as never] }), 7])),
        "hosts",
      ).list(),
    ).toEqual([]);
  });

  it("works without storage", () => {
    const store = createSavedHostStore(null);
    store.save(host());

    expect(store.list()).toEqual([]);
  });
});
