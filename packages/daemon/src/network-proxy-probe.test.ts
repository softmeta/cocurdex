import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { NetworkProxySettings } from "@cocurdex/shared";
import { afterEach, describe, expect, it } from "vitest";
import { probeNetworkProxy } from "./network-proxy-probe";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

function manualSettings(httpProxy: string): NetworkProxySettings {
  return {
    mode: "manual",
    httpProxy,
    httpsProxy: "",
    allProxy: "",
    noProxy: "",
  };
}

describe("probeNetworkProxy", () => {
  it("rejects an empty manual configuration instead of testing direct access", async () => {
    const result = await probeNetworkProxy(manualSettings(""), {
      url: "http://proxy-test.invalid/json",
      timeoutMs: 1_000,
    });

    expect(result).toEqual({
      ok: false,
      durationMs: 0,
      error: "Manual proxy mode requires at least one proxy URL",
    });
  });

  it("routes the probe through the selected proxy", async () => {
    let proxyRequests = 0;
    const proxy = createServer((_request, response) => {
      proxyRequests += 1;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          ip: "203.0.113.8",
          city: "Proxy City",
          country: "PX",
          org: "Proxy Network",
        }),
      );
    });
    servers.push(proxy);
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const { port } = proxy.address() as AddressInfo;

    const result = await probeNetworkProxy(
      manualSettings(`http://127.0.0.1:${port}`),
      {
        url: "http://proxy-test.invalid/json",
        timeoutMs: 1_000,
      },
    );

    expect(proxyRequests).toBe(1);
    expect(result).toEqual({
      ok: true,
      durationMs: expect.any(Number),
      ip: "203.0.113.8",
      city: "Proxy City",
      country: "PX",
      org: "Proxy Network",
    });
  });

  it("reports a broken proxy instead of falling back to a direct request", async () => {
    const unavailableProxy = createServer();
    await new Promise<void>((resolve) =>
      unavailableProxy.listen(0, "127.0.0.1", resolve),
    );
    const { port } = unavailableProxy.address() as AddressInfo;
    await new Promise<void>((resolve, reject) =>
      unavailableProxy.close((error) => (error ? reject(error) : resolve())),
    );

    const result = await probeNetworkProxy(
      manualSettings(`http://127.0.0.1:${port}`),
      {
        url: "http://proxy-test.invalid/json",
        timeoutMs: 1_000,
      },
    );

    expect(result.ok).toBe(false);
  });
});
