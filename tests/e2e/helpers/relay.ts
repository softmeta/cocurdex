import path from "node:path";
import {
  buildGoBinary,
  runProcess,
  type ServiceProcess,
  startService,
} from "./go-service";

export { freePort } from "./go-service";

export type RelayProcess = ServiceProcess;

export function buildRelay(outDir: string) {
  return buildGoBinary("@cocurdex/relay", "cocurdex-relay", outDir);
}

export function runRelayCommand(binary: string, args: string[]) {
  return runProcess(binary, args, path.dirname(binary));
}

export function startRelay(
  binary: string,
  dataDir: string,
  extraArgs: string[] = [],
  port?: number,
): Promise<RelayProcess> {
  return startService(
    binary,
    (listen) => [
      "serve",
      "--listen",
      listen,
      "--data-dir",
      dataDir,
      ...extraArgs,
    ],
    dataDir,
    port,
  );
}
