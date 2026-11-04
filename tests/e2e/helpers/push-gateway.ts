import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import {
  buildGoBinary,
  runProcess,
  type ServiceProcess,
  startService,
} from "./go-service";

export interface ApnsDelivery {
  token: string;
  headers: http.IncomingHttpHeaders;
  payload: { aps: Record<string, unknown>; c: string };
}

export interface FakeApns {
  url: string;
  deliveries: ApnsDelivery[];
  unregisteredTokens: Set<string>;
  close(): Promise<void>;
}

export async function startFakeApns(): Promise<FakeApns> {
  const deliveries: ApnsDelivery[] = [];
  const unregisteredTokens = new Set<string>();
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const token = (request.url ?? "").replace("/3/device/", "");
      if (unregisteredTokens.has(token)) {
        response.writeHead(410, { "content-type": "application/json" });
        response.end(JSON.stringify({ reason: "Unregistered" }));
        return;
      }
      deliveries.push({
        token,
        headers: request.headers,
        payload: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      });
      response.writeHead(200);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    deliveries,
    unregisteredTokens,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export function buildPushGateway(outDir: string) {
  return buildGoBinary("@cocurdex/push", "cocurdex-push", outDir);
}

export async function startPushGateway(
  binary: string,
  dataDir: string,
  apnsEndpoint: string,
): Promise<ServiceProcess> {
  const keysFile = path.join(dataDir, "handle-keys.json");
  writeFileSync(
    keysFile,
    await runProcess(binary, ["keygen"], dataDir),
    "utf8",
  );
  const apnsKeyFile = path.join(dataDir, "apns.p8");
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  writeFileSync(
    apnsKeyFile,
    privateKey.export({ format: "pem", type: "pkcs8" }),
    "utf8",
  );
  return startService(
    binary,
    (listen) => [
      "serve",
      "--listen",
      listen,
      "--handle-keys-file",
      keysFile,
      "--apns-key-file",
      apnsKeyFile,
      "--apns-key-id",
      "KEYID00001",
      "--apns-team-id",
      "TEAMID0001",
      "--apns-endpoint",
      apnsEndpoint,
    ],
    dataDir,
  );
}
