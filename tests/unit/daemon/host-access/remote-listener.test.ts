import http from "node:http";
import net from "node:net";
import { createRemoteAccessListener } from "@cocurdex/daemon/internal/host-access/remote-listener";
import { afterEach, describe, expect, it } from "vitest";

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port")),
      );
    });
  });
}

function createServer() {
  const server = http.createServer((_request, response) => {
    response.end("ok");
  });
  return {
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const listeners: ReturnType<typeof createRemoteAccessListener>[] = [];

afterEach(async () => {
  for (const listener of listeners.splice(0)) await listener.close();
});

describe("createRemoteAccessListener", () => {
  it("serves on the configured port while enabled and stops when disabled", async () => {
    const listener = createRemoteAccessListener(createServer);
    listeners.push(listener);
    const port = await freePort();

    expect(await listener.apply({ enabled: true, port })).toEqual({
      listening: true,
      error: null,
    });
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(await response.text()).toBe("ok");

    expect(await listener.apply({ enabled: false, port })).toEqual({
      listening: false,
      error: null,
    });
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
  });

  it("reports a port conflict instead of throwing", async () => {
    const blocker = net.createServer();
    await new Promise<void>((resolve) =>
      blocker.listen({ port: 0, host: "::", ipv6Only: false }, resolve),
    );
    const address = blocker.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const listener = createRemoteAccessListener(createServer);
    listeners.push(listener);

    const state = await listener.apply({ enabled: true, port });
    await new Promise<void>((resolve) => blocker.close(() => resolve()));

    expect(state.listening).toBe(false);
    expect(state.error).toMatch(/EADDRINUSE/);
  });
});
