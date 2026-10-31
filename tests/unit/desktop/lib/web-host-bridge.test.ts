import {
  createSavedHostStore,
  type FetchLike,
  type SavedHost,
} from "@cocurdex/client-runtime";
import { describe, expect, it, vi } from "vitest";
import {
  buildDevWebClientUrl,
  resolveDevDaemonUrl,
  resolveWebHostAccess,
  type WebHostAccessDeps,
  webHostCapabilities,
} from "@/lib/web-host-bridge";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const localPage = {
  host: "127.0.0.1:53508",
  origin: "http://127.0.0.1:53508",
  protocol: "http:",
};

const remotePage = {
  host: "192.168.1.20:47820",
  origin: "http://192.168.1.20:47820",
  protocol: "http:",
};

const pairedHost = {
  host: { hostId: "host-1", name: "Studio" },
  deviceId: "device-1",
  token: "cocu_dev_a",
  scopes: ["read"],
};

function hostResponses(
  routes: Record<string, number>,
): FetchLike & ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const status = routes[new URL(url).pathname] ?? 404;
    return Response.json(status === 200 ? pairedHost : {}, { status });
  });
}

function deps(fetch?: FetchLike): WebHostAccessDeps {
  return {
    sessionStore: memoryStore(),
    savedHosts: createSavedHostStore(memoryStore()),
    fetch,
  };
}

describe("resolveWebHostAccess", () => {
  it("connects the loopback page with the fragment token and remembers it for reloads", async () => {
    const access = deps();
    await expect(
      resolveWebHostAccess({ ...localPage, hash: "#token=abc" }, access),
    ).resolves.toEqual({
      kind: "local",
      connection: { token: "abc", webSocketUrl: "ws://127.0.0.1:53508" },
    });
    await expect(
      resolveWebHostAccess({ ...localPage, hash: "" }, access),
    ).resolves.toMatchObject({ kind: "local", connection: { token: "abc" } });
  });

  it("exchanges a pairing link and keeps the device credential for later visits", async () => {
    const fetch = hostResponses({ "/api/pair": 200, "/api/session": 200 });
    const access = deps(fetch);

    await expect(
      resolveWebHostAccess({ ...remotePage, hash: "#pair=code-1" }, access),
    ).resolves.toMatchObject({
      kind: "device",
      connection: {
        token: "cocu_dev_a",
        webSocketUrl: "ws://192.168.1.20:47820",
      },
    });
    await expect(
      resolveWebHostAccess({ ...remotePage, hash: "" }, access),
    ).resolves.toMatchObject({ kind: "device", host: { hostId: "host-1" } });
    expect(fetch).toHaveBeenLastCalledWith(
      "http://192.168.1.20:47820/api/session",
      expect.anything(),
    );
  });

  it("asks to pair again and forgets the credential once the host revokes it", async () => {
    const access = deps(
      hostResponses({ "/api/pair": 200, "/api/session": 401 }),
    );
    await resolveWebHostAccess({ ...remotePage, hash: "#pair=code-1" }, access);

    await expect(
      resolveWebHostAccess({ ...remotePage, hash: "" }, access),
    ).resolves.toEqual({ kind: "needsPairing", reason: "invalid" });
    expect(access.savedHosts.list()).toEqual([]);
  });

  it("keeps a saved credential while the host is unreachable", async () => {
    const access = deps(hostResponses({ "/api/pair": 200 }));
    await resolveWebHostAccess({ ...remotePage, hash: "#pair=code-1" }, access);
    access.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };

    await expect(
      resolveWebHostAccess({ ...remotePage, hash: "" }, access),
    ).resolves.toMatchObject({ kind: "device" });
  });

  it("explains why a pairing link failed", async () => {
    await expect(
      resolveWebHostAccess(
        { ...remotePage, hash: "#pair=used" },
        deps(hostResponses({ "/api/pair": 429 })),
      ),
    ).resolves.toEqual({ kind: "needsPairing", reason: "rateLimited" });
    await expect(
      resolveWebHostAccess({ ...remotePage, hash: "" }, deps()),
    ).resolves.toEqual({ kind: "needsPairing", reason: "missing" });
  });
});

describe("dev web client", () => {
  const devServer = "http://localhost:5173";
  const daemon = { token: "abc", webSocketUrl: "ws://127.0.0.1:53508" };

  it("connects the dev server page to the daemon named in its link, across reloads", async () => {
    const store = memoryStore();
    const hash = new URL(buildDevWebClientUrl(devServer, daemon)).hash;

    expect(resolveDevDaemonUrl(hash, store)).toBe("ws://127.0.0.1:53508");
    expect(resolveDevDaemonUrl("", store)).toBe("ws://127.0.0.1:53508");

    const access = {
      ...deps(),
      localDaemonUrl: resolveDevDaemonUrl("", store),
    };
    await expect(
      resolveWebHostAccess(
        {
          hash,
          host: "localhost:5173",
          origin: devServer,
          protocol: "http:",
        },
        access,
      ),
    ).resolves.toEqual({ kind: "local", connection: daemon });
  });

  it("ignores a daemon address that is not a loopback WebSocket", () => {
    const store = memoryStore();
    expect(
      resolveDevDaemonUrl("#daemon=ws%3A%2F%2F192.168.1.20%3A47820", store),
    ).toBeNull();
    expect(
      resolveDevDaemonUrl("#daemon=http%3A%2F%2F127.0.0.1%3A53508", store),
    ).toBeNull();
    expect(resolveDevDaemonUrl("", store)).toBeNull();
  });
});

describe("webHostCapabilities", () => {
  const connection = { token: "t", webSocketUrl: "ws://127.0.0.1:1" };
  const device = (scopes: SavedHost["scopes"]) => ({
    kind: "device" as const,
    connection,
    host: {
      hostId: "host-1",
      name: "Studio",
      baseUrl: remotePage.origin,
      deviceId: "device-1",
      token: "cocu_dev_a",
      scopes,
      pairedAt: "2026-10-12T00:00:00.000Z",
    },
  });

  it("lets the loopback page use the host terminal and file manager", () => {
    expect(webHostCapabilities({ kind: "local", connection })).toMatchObject({
      fileManager: true,
      terminal: true,
    });
  });

  it("offers a paired device the terminal only with the execute scope", () => {
    expect(webHostCapabilities(device(["read", "execute"]))).toMatchObject({
      fileManager: false,
      terminal: true,
    });
    expect(webHostCapabilities(device(["read"]))).toMatchObject({
      fileManager: false,
      terminal: false,
    });
  });
});
