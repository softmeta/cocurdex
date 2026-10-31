import http from "node:http";
import type { AddressInfo } from "node:net";
import net from "node:net";
import { applyNodeGlobalProxy } from "@cocurdex/shared/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tunnels: string[] = [];
let proxyUrl = "";
let targetPort = 0;

const target = http.createServer((_request, response) => {
  response.end("target");
});

const proxy = http.createServer((_request, response) => {
  response.statusCode = 502;
  response.end();
});
proxy.on("connect", (request, socket, head) => {
  tunnels.push(request.url ?? "");
  const upstream = net.connect(targetPort, "127.0.0.1", () => {
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

async function fetchTarget(host: string) {
  tunnels.length = 0;
  const response = await fetch(`http://${host}:${targetPort}/`, {
    signal: AbortSignal.timeout(5_000),
  });
  return { body: await response.text(), tunnels: [...tunnels] };
}

beforeAll(async () => {
  targetPort = await listen(target);
  proxyUrl = `http://127.0.0.1:${await listen(proxy)}`;
});

afterAll(async () => {
  applyNodeGlobalProxy({});
  await Promise.all([close(proxy), close(target)]);
});

describe("applyNodeGlobalProxy", () => {
  it("routes fetch through a proxy applied at runtime and switches back", async () => {
    expect(await fetchTarget("127.0.0.1")).toEqual({
      body: "target",
      tunnels: [],
    });

    applyNodeGlobalProxy({ HTTP_PROXY: proxyUrl, NO_PROXY: "" });
    expect(await fetchTarget("proxied.invalid")).toEqual({
      body: "target",
      tunnels: [`proxied.invalid:${targetPort}`],
    });

    applyNodeGlobalProxy({ HTTP_PROXY: proxyUrl, NO_PROXY: "127.0.0.1" });
    expect(await fetchTarget("127.0.0.1")).toEqual({
      body: "target",
      tunnels: [],
    });

    applyNodeGlobalProxy({ HTTP_PROXY: proxyUrl, NO_PROXY: "" });
    expect(await fetchTarget("127.0.0.1")).toEqual({
      body: "target",
      tunnels: [`127.0.0.1:${targetPort}`],
    });

    applyNodeGlobalProxy({});
    expect(await fetchTarget("127.0.0.1")).toEqual({
      body: "target",
      tunnels: [],
    });
  });
});
