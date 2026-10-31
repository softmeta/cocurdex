import { describe, expect, it } from "vitest";
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

function deps(): WebHostAccessDeps {
  return { sessionStore: memoryStore() };
}

describe("resolveWebHostAccess", () => {
  it("connects the loopback page with the fragment token and remembers it for reloads", () => {
    const access = deps();
    expect(
      resolveWebHostAccess({ ...localPage, hash: "#token=abc" }, access),
    ).toEqual({
      kind: "local",
      connection: { token: "abc", webSocketUrl: "ws://127.0.0.1:53508" },
    });
    expect(
      resolveWebHostAccess({ ...localPage, hash: "" }, access),
    ).toMatchObject({ kind: "local", connection: { token: "abc" } });
  });

  it("does not open the app for a page reached without a desktop link", () => {
    expect(
      resolveWebHostAccess({ ...localPage, hash: "#pair=code-1" }, deps()),
    ).toEqual({ kind: "unlinked" });
  });
});

describe("dev web client", () => {
  const devServer = "http://localhost:5173";
  const daemon = { token: "abc", webSocketUrl: "ws://127.0.0.1:53508" };

  it("connects the dev server page to the daemon named in its link, across reloads", () => {
    const store = memoryStore();
    const hash = new URL(buildDevWebClientUrl(devServer, daemon)).hash;

    expect(resolveDevDaemonUrl(hash, store)).toBe("ws://127.0.0.1:53508");
    expect(resolveDevDaemonUrl("", store)).toBe("ws://127.0.0.1:53508");

    const access = {
      ...deps(),
      localDaemonUrl: resolveDevDaemonUrl("", store),
    };
    expect(
      resolveWebHostAccess(
        {
          hash,
          host: "localhost:5173",
          origin: devServer,
          protocol: "http:",
        },
        access,
      ),
    ).toEqual({ kind: "local", connection: daemon });
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

  it("lets only the loopback page use the host terminal and file manager", () => {
    expect(webHostCapabilities({ kind: "local", connection })).toMatchObject({
      fileManager: true,
      terminal: true,
    });
    expect(webHostCapabilities({ kind: "unlinked" })).toMatchObject({
      fileManager: false,
      terminal: false,
    });
  });
});
