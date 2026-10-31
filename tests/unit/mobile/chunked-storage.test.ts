import { createSavedHostStore, type SavedHost } from "@cocurdex/client-runtime";
import {
  type ChunkStore,
  createChunkedStorage,
  splitChunks,
} from "@cocurdex/mobile/internal/storage/chunked-storage";
import { describe, expect, it } from "vitest";

const KEYCHAIN_VALUE_BYTES = 2048;

function memoryStore() {
  const values = new Map<string, string>();
  const store: ChunkStore = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    deleteItem: (key) => {
      values.delete(key);
    },
  };
  return { values, store };
}

function host(index: number): SavedHost {
  return {
    hostId: `host-${index}`,
    name: `工作站 ${index} 🖥️`,
    baseUrl: `http://192.168.1.${index}:7788`,
    deviceId: `device-${index}`,
    hostKey: "h".repeat(43),
    deviceSecretKey: `${"s".repeat(40)}-${index}`,
    scopes: ["read", "files.read", "interact"],
    pairedAt: "2026-10-24T00:00:00.000Z",
  };
}

describe("createChunkedStorage", () => {
  it("keeps every keychain value under the platform limit", () => {
    const { values, store } = memoryStore();
    const hosts = createSavedHostStore(createChunkedStorage(store));
    const saved = Array.from({ length: 12 }, (_, index) => host(index + 1));

    for (const entry of saved) hosts.save(entry);

    expect(hosts.list()).toEqual(saved);
    for (const value of values.values()) {
      expect(Buffer.byteLength(value, "utf8")).toBeLessThanOrEqual(
        KEYCHAIN_VALUE_BYTES,
      );
    }
  });

  it("removes the previous chunks after a rewrite", () => {
    const { values, store } = memoryStore();
    const storage = createChunkedStorage(store, 4);

    storage.setItem("hosts", "abcdefghij");
    storage.setItem("hosts", "xy");

    expect(storage.getItem("hosts")).toBe("xy");
    expect([...values.keys()].sort()).toEqual(["hosts", "hosts.2.0"]);
  });

  it("keeps the previous value when a rewrite fails midway", () => {
    const { store } = memoryStore();
    const storage = createChunkedStorage(store, 4);
    storage.setItem("hosts", "first-value");

    let writes = 0;
    const failing = createChunkedStorage(
      {
        ...store,
        setItem: (key, value) => {
          writes += 1;
          if (writes === 2) throw new Error("keychain refused");
          store.setItem(key, value);
        },
      },
      4,
    );

    expect(() => failing.setItem("hosts", "second-value")).toThrow();
    expect(storage.getItem("hosts")).toBe("first-value");
  });

  it("reads nothing when a chunk is missing", () => {
    const { values, store } = memoryStore();
    const storage = createChunkedStorage(store, 4);
    storage.setItem("hosts", "abcdefgh");
    values.delete("hosts.1.1");

    expect(storage.getItem("hosts")).toBeNull();
    expect(storage.getItem("unknown")).toBeNull();
  });
});

describe("splitChunks", () => {
  it("never splits a surrogate pair", () => {
    const chunks = splitChunks("ab😀cd", 3);

    expect(chunks.join("")).toBe("ab😀cd");
    expect(chunks).toEqual(["ab", "😀c", "d"]);
  });
});
