import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { installFixtureDb } from "@cocurdex/e2e/fixture-db/install";
import {
  bundledDaemonPath,
  spawnDaemon,
} from "@cocurdex/e2e/helpers/daemon-process";
import { buildHostPairingLink } from "@cocurdex/shared";
import type { createTempDirs } from "@cocurdex/shared/testing";
import { EMULATOR_HOST_ALIAS } from "./android";
import type { MobilePlatform } from "./target";

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("No free port")),
      );
    });
  });
}

export async function startPairingDaemon(
  platform: MobilePlatform,
  tempDirs: ReturnType<typeof createTempDirs>,
) {
  if (!existsSync(bundledDaemonPath)) {
    throw new Error(`Missing ${bundledDaemonPath}; run with --build first`);
  }
  const root = tempDirs.createSync("cocu-m-");
  const userDataPath = path.join(root, "data");
  await installFixtureDb({
    userDataPath,
    workspaceParent: path.join(root, "ws"),
  });
  const daemon = await spawnDaemon({ entry: "bundled", userDataPath });
  try {
    const port = await freePort();
    const status = await requestDaemon(
      "host.remoteAccess.set",
      { enabled: true, port },
      daemon.options,
    );
    if (!status.listening) {
      throw new Error(`Remote access did not start: ${status.error}`);
    }
    const address =
      status.addresses.find((candidate) => candidate.kind === "lan") ??
      status.addresses[0];
    if (!address) throw new Error("Remote access reported no address");
    const baseUrl = new URL(address.url);
    if (platform === "android") baseUrl.hostname = EMULATOR_HOST_ALIAS;
    return {
      hostAddress: baseUrl.host,
      async createPairingLink() {
        const { code } = await requestDaemon(
          "host.pairing.create",
          { label: "Mobile e2e", scopes: ["read", "files.read", "interact"] },
          daemon.options,
        );
        return buildHostPairingLink(baseUrl.origin, code);
      },
      pairedDevices: () => requestDaemon("host.devices.list", daemon.options),
      sessionAttention: () => requestDaemon("attention.list", daemon.options),
      dispose: () => daemon.dispose(),
    };
  } catch (error) {
    await daemon.dispose();
    throw error;
  }
}
