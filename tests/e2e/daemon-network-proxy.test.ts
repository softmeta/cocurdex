import http from "node:http";
import type { AddressInfo } from "node:net";
import { requestDaemon } from "@cocurdex/daemon/client";
import type { ProviderAuthLoginUpdate } from "@cocurdex/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type DaemonProcess,
  spawnDaemon,
  waitFor,
} from "./helpers/daemon-process";

const tunnels: string[] = [];
const proxy = http.createServer((_request, response) => {
  response.statusCode = 502;
  response.end();
});
proxy.on("connect", (request, socket) => {
  tunnels.push(request.url ?? "");
  socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
});

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

describe("daemon network proxy", () => {
  let daemon: DaemonProcess;
  let proxyUrl = "";

  beforeAll(async () => {
    proxyUrl = `http://127.0.0.1:${await listen(proxy)}`;
    daemon = await spawnDaemon();
  });

  afterAll(async () => {
    await daemon.dispose();
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
  });

  it("sends provider login requests through a manual proxy set at runtime", async () => {
    await requestDaemon(
      "network.proxy.set",
      {
        settings: {
          mode: "manual",
          httpProxy: proxyUrl,
          httpsProxy: "",
          allProxy: "",
          noProxy: "localhost,127.0.0.1",
        },
      },
      daemon.options,
    );

    const { loginId } = await requestDaemon(
      "provider.auth.login.start",
      { providerId: "github-copilot", method: "oauth" },
      daemon.options,
    );
    const updates: ProviderAuthLoginUpdate[] = [];
    try {
      for (;;) {
        const update = await requestDaemon(
          "provider.auth.login.next",
          { loginId },
          daemon.options,
        );
        updates.push(update);
        if (update.type === "prompt") {
          await requestDaemon(
            "provider.auth.login.respond",
            { loginId, promptId: update.prompt.id, value: "" },
            daemon.options,
          );
          continue;
        }
        if (update.type === "error" || update.type === "device_code") break;
      }
    } finally {
      await requestDaemon(
        "provider.auth.login.cancel",
        { loginId },
        daemon.options,
      ).catch(() => null);
    }

    await waitFor(() => tunnels.length > 0, 10_000);
    expect(tunnels.every((target) => target.endsWith(":443"))).toBe(true);
    expect(tunnels.some((target) => target.startsWith("github.com:"))).toBe(
      true,
    );
  });
});
