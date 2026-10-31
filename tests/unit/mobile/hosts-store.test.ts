import {
  createSavedHostStore,
  type KeyValueStorage,
  type SavedHost,
} from "@cocurdex/client-runtime";
import {
  createHostsStore,
  forgetHostsFromPreviousInstall,
} from "@cocurdex/mobile/internal/hosts/hosts-store";
import { afterEach, describe, expect, it, vi } from "vitest";

const HOST_KEY = `CQ${"A".repeat(41)}`;
const LINK = `http://192.168.1.20:47820/#pair=K7-2Q&hk=${HOST_KEY}`;

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

const PAIRED: SavedHost = {
  hostId: "host-1",
  name: "Studio Mac",
  baseUrl: "http://192.168.1.20:47820",
  deviceId: "device-1",
  hostKey: HOST_KEY,
  deviceSecretKey: "B".repeat(43),
  scopes: ["read", "interact"],
  pairedAt: "2026-10-12T00:00:00.000Z",
};

function pairedStorage(host: Partial<SavedHost> = {}) {
  const storage = memoryStorage();
  createSavedHostStore(storage).save({ ...PAIRED, ...host });
  return storage;
}

function unreachableNetwork() {
  const opened = vi.fn();
  class Unreachable extends EventTarget {
    static readonly OPEN = 1;
    readyState = 0;
    binaryType = "blob";
    constructor() {
      super();
      opened();
      queueMicrotask(() => {
        this.dispatchEvent(new Event("error"));
        this.dispatchEvent(new Event("close"));
      });
    }
    send() {}
    close() {}
  }
  vi.stubGlobal("WebSocket", Unreachable);
  return opened;
}

afterEach(() => vi.unstubAllGlobals());

describe("createHostsStore", () => {
  it("reports a malformed link without calling the host", async () => {
    const opened = unreachableNetwork();
    const hosts = createHostsStore(memoryStorage());

    await expect(hosts.pair("192.168.1.20", "Pocket")).resolves.toEqual({
      failure: "link",
    });
    expect(opened).not.toHaveBeenCalled();
  });

  it("reports a host that cannot be reached and keeps nothing", async () => {
    const opened = unreachableNetwork();
    const hosts = createHostsStore(memoryStorage());

    await expect(hosts.pair(LINK, "Pocket")).resolves.toEqual({
      failure: "unreachable",
    });
    expect(opened).toHaveBeenCalledOnce();
    expect(hosts.getSnapshot()).toEqual([]);
  });

  it("reports a link whose host key cannot be used instead of throwing", async () => {
    const opened = unreachableNetwork();
    const hosts = createHostsStore(memoryStorage());
    const lowOrderKey = LINK.replace(HOST_KEY, "A".repeat(43));

    await expect(hosts.pair(lowOrderKey, "Pocket")).resolves.toEqual({
      failure: "invalid",
    });
    expect(opened).not.toHaveBeenCalled();
  });

  it("forgets a removed host", () => {
    const hosts = createHostsStore(pairedStorage());

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
  it("drops hosts a previous install left in the keychain", () => {
    const storage = pairedStorage();
    const hosts = createHostsStore(storage);
    const marker = memoryMarker();

    forgetHostsFromPreviousInstall(marker, hosts);

    expect(hosts.getSnapshot()).toEqual([]);
    expect(createHostsStore(storage).getSnapshot()).toEqual([]);
    expect(marker.create).toHaveBeenCalledOnce();
  });

  it("keeps hosts paired since this install", () => {
    const storage = memoryStorage();
    const marker = memoryMarker();
    forgetHostsFromPreviousInstall(marker, createHostsStore(storage));
    createSavedHostStore(storage).save(PAIRED);

    forgetHostsFromPreviousInstall(marker, createHostsStore(storage));

    expect(createHostsStore(storage).getSnapshot()).toHaveLength(1);
  });

  it("adopts scopes the host reports and stays quiet when they are unchanged", () => {
    const storage = pairedStorage();
    const hosts = createHostsStore(storage);
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

  it("keeps the addresses a host reports so it stays reachable off the LAN", () => {
    const storage = pairedStorage({
      endpoints: ["http://192.168.1.20:47820", "http://100.101.1.2:47820"],
    });
    const hosts = createHostsStore(storage);

    hosts.switchOrigin("host-1", "http://100.101.1.2:47820");
    hosts.adoptSession("host-1", {
      endpoints: ["http://100.101.1.2:47820", "http://10.0.0.8:47820"],
    });

    expect(createHostsStore(storage).getSnapshot()[0]).toMatchObject({
      baseUrl: "http://100.101.1.2:47820",
      endpoints: ["http://100.101.1.2:47820", "http://10.0.0.8:47820"],
    });
  });

  it("renames a computer only on this phone and keeps the name across launches", () => {
    const storage = pairedStorage();
    const hosts = createHostsStore(storage);
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
