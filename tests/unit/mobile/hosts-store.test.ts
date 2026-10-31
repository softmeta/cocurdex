import type { KeyValueStorage } from "@cocurdex/client-runtime";
import {
  createHostsStore,
  forgetHostsFromPreviousInstall,
} from "@cocurdex/mobile/internal/hosts/hosts-store";
import { describe, expect, it, vi } from "vitest";

const LINK = "http://192.168.1.20:47820/#pair=K7-2Q";

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function hostAnswering(status: number, body: unknown = {}) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

const PAIRED = {
  host: { hostId: "host-1", name: "Studio Mac" },
  deviceId: "device-1",
  token: "token-1",
  scopes: ["read", "interact"],
};

describe("createHostsStore", () => {
  it("pairs from a link, saves the host, and notifies subscribers", async () => {
    const storage = memoryStorage();
    const hosts = createHostsStore(storage);
    const listener = vi.fn();
    hosts.subscribe(listener);
    const fetchImpl = hostAnswering(200, PAIRED);

    const result = await hosts.pair(LINK, "Pocket", fetchImpl);

    expect(result).toMatchObject({ host: { hostId: "host-1" } });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://192.168.1.20:47820/api/pair",
      expect.objectContaining({
        body: JSON.stringify({ code: "K7-2Q", label: "Pocket" }),
      }),
    );
    expect(listener).toHaveBeenCalledOnce();
    expect(hosts.getSnapshot()).toEqual([
      expect.objectContaining({
        hostId: "host-1",
        baseUrl: "http://192.168.1.20:47820",
      }),
    ]);
    expect(createHostsStore(storage).getSnapshot()).toHaveLength(1);
  });

  it("reports a malformed link without calling the host", async () => {
    const fetchImpl = hostAnswering(200, PAIRED);
    const hosts = createHostsStore(memoryStorage());

    await expect(
      hosts.pair("192.168.1.20", "Pocket", fetchImpl),
    ).resolves.toEqual({ failure: "link" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a rejected code and keeps nothing", async () => {
    const hosts = createHostsStore(memoryStorage());

    await expect(
      hosts.pair(LINK, "Pocket", hostAnswering(401)),
    ).resolves.toEqual({ failure: "invalid" });
    expect(hosts.getSnapshot()).toEqual([]);
  });

  it("forgets a removed host", async () => {
    const hosts = createHostsStore(memoryStorage());
    await hosts.pair(LINK, "Pocket", hostAnswering(200, PAIRED));

    hosts.remove("host-1");

    expect(hosts.getSnapshot()).toEqual([]);
  });
});

function memoryMarker(exists = false) {
  let present = exists;
  return {
    exists: () => present,
    create: vi.fn(() => {
      present = true;
    }),
  };
}

describe("forgetHostsFromPreviousInstall", () => {
  it("drops hosts a previous install left in the keychain", async () => {
    const storage = memoryStorage();
    await createHostsStore(storage).pair(
      LINK,
      "Pocket",
      hostAnswering(200, PAIRED),
    );
    const hosts = createHostsStore(storage);
    const marker = memoryMarker();

    forgetHostsFromPreviousInstall(marker, hosts);

    expect(hosts.getSnapshot()).toEqual([]);
    expect(createHostsStore(storage).getSnapshot()).toEqual([]);
    expect(marker.create).toHaveBeenCalledOnce();
  });

  it("keeps hosts paired since this install", async () => {
    const storage = memoryStorage();
    const hosts = createHostsStore(storage);
    const marker = memoryMarker();
    forgetHostsFromPreviousInstall(marker, hosts);
    await hosts.pair(LINK, "Pocket", hostAnswering(200, PAIRED));

    forgetHostsFromPreviousInstall(marker, createHostsStore(storage));

    expect(createHostsStore(storage).getSnapshot()).toHaveLength(1);
  });

  it("adopts scopes the host reports and stays quiet when they are unchanged", async () => {
    const storage = memoryStorage();
    const hosts = createHostsStore(storage);
    await hosts.pair(LINK, "Pocket", hostAnswering(200, PAIRED));
    const listener = vi.fn();
    hosts.subscribe(listener);

    hosts.adoptSession("host-1", { scopes: ["interact", "read"] });
    expect(listener).not.toHaveBeenCalled();

    hosts.adoptSession("host-1", {
      scopes: ["read", "interact", "files.read"],
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createHostsStore(storage).getSnapshot()[0]?.scopes).toEqual([
      "read",
      "interact",
      "files.read",
    ]);
  });

  it("keeps the addresses a host reports so it stays reachable off the LAN", async () => {
    const storage = memoryStorage();
    const hosts = createHostsStore(storage);
    await hosts.pair(
      LINK,
      "Pocket",
      hostAnswering(200, {
        ...PAIRED,
        endpoints: ["http://100.101.1.2:47820", "http://192.168.1.20:47820"],
      }),
    );

    hosts.switchOrigin("host-1", "http://100.101.1.2:47820");
    hosts.adoptSession("host-1", {
      endpoints: ["http://100.101.1.2:47820", "http://10.0.0.8:47820"],
    });

    expect(createHostsStore(storage).getSnapshot()[0]).toMatchObject({
      baseUrl: "http://100.101.1.2:47820",
      endpoints: ["http://100.101.1.2:47820", "http://10.0.0.8:47820"],
    });
  });

  it("renames a computer only on this phone and keeps the name across launches", async () => {
    const storage = memoryStorage();
    const hosts = createHostsStore(storage);
    await hosts.pair(LINK, "Pocket", hostAnswering(200, PAIRED));
    const listener = vi.fn();
    hosts.subscribe(listener);

    hosts.rename("host-1", "  Desk Mac  ");
    hosts.rename("host-1", "   ");

    expect(listener).toHaveBeenCalledOnce();
    expect(createHostsStore(storage).getSnapshot()).toEqual([
      expect.objectContaining({ hostId: "host-1", name: "Desk Mac" }),
    ]);
  });
});
